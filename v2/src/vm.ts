import type {HexString, BytesLike, BigNumberish, Provider, MaybeHex, RPCEthGetProof, RPCEthGetBlock} from './types.js';
import {ethers} from 'ethers';
import {unwrap, Wrapped} from './wrap.js';
import {CachedMap} from './cached.js';

const ABI_CODER = ethers.AbiCoder.defaultAbiCoder();

const MAX_READ_SIZE = 1024; // maximum number of bytes from single read()
const MAX_TARGETS = 32; // maximum number of target switches

const NULL_CODE_HASH = ethers.id('');

const ACCOUNT_PROOF_PH = -1n;

// OP_EVAL flags
const STOP_ON_SUCCESS = 1;
const STOP_ON_FAILURE = 2;
const ACQUIRE_STATE = 4;

const OP_DEBUG = 255; // experimental
const OP_TARGET = 1;
const OP_SET_OUTPUT = 2;
const OP_EVAL = 3;

const OP_REQ_NONZERO = 10;
const OP_REQ_CONTRACT = 11;

const OP_READ_SLOTS = 20;
const OP_READ_BYTES = 21;
const OP_READ_ARRAY = 22;

const OP_SLOT_ZERO = 30;
const OP_SLOT_ADD = 31;
const OP_SLOT_FOLLOW = 32;

const OP_PUSH_INPUT = 40;
const OP_PUSH_OUTPUT = 41;
const OP_PUSH_SLOT = 42;
const OP_PUSH_TARGET = 43;

const OP_DUP = 50;
const OP_POP = 51;

const OP_KECCAK = 60;
const OP_CONCAT = 61;
const OP_SLICE = 62;

function uint256FromHex(hex: string) {
	// the following should be equivalent to EVMProofHelper.toUint256()
	return hex === '0x' ? 0n : BigInt(hex.slice(0, 66));
}
function addressFromHex(hex: string) {
	// the following should be equivalent to: address(uint160(_toUint256(x)))
	return '0x' + (hex.length >= 66 ? hex.slice(26, 66) : hex.slice(2).padStart(40, '0').slice(-40)).toLowerCase();
}
function bigintRange(start: bigint, length: number) {
	return Array.from({length}, (_, i) => start + BigInt(i));
}
function solidityArraySlots(slot: BigNumberish, length: number) {
	return length ? bigintRange(BigInt(ethers.solidityPackedKeccak256(['uint256'], [slot])), length) : [];
}
export function solidityFollowSlot(slot: BigNumberish, key: BytesLike) {
	// https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#mappings-and-dynamic-arrays
	return BigInt(ethers.keccak256(ethers.concat([key, ethers.toBeHex(slot, 32)])));
}

export class CommandReader {
	static fromCommand(cmd: EVMCommand) {
		return new this(Uint8Array.from(cmd.ops), cmd.inputs.slice());
	}
	static fromEncoded(hex: HexString) {
		let [ops, inputs] = ABI_CODER.decode(['bytes', 'bytes[]'], hex);
		return new this(ethers.getBytes(ops), [...inputs]);
	}
	pos: number = 0;
	constructor(readonly ops: Uint8Array, readonly inputs: HexString[]) {
		this.ops = ops;
		this.inputs = inputs;
	}
	get remaining() {
		return this.ops.length - this.pos;
	}
	checkSize(n: number) {
		if (this.pos + n > this.ops.length) throw new Error('reader overflow');
	}
	readByte() {
		this.checkSize(1);
		return this.ops[this.pos++];
	}
	readShort() {
		//this.checkSize(2);
		return (this.readByte() << 8) | this.readByte();
	}
	readBytes() {
		let n = this.readShort();
		this.checkSize(n);
		return ethers.hexlify(this.ops.subarray(this.pos, this.pos += n));
	}
	readInput() {
		let i = this.readByte();
		if (i >= this.inputs.length) throw new Error(`invalid input index: ${i}`);
		return this.inputs[i];
	}
}

export class EVMCommand {	
	constructor(
		private parent: EVMCommand | undefined,
		readonly ops: number[] = [],
		readonly inputs: string[] = [],
	) {}
	clone() {
		return new EVMCommand(this.parent, this.ops.slice(), this.inputs.slice());
	}
	protected addByte(x: number) {
		if ((x & 0xFF) !== x) throw new Error(`expected byte: ${x}`);
		this.ops.push(x);
		return this;
	}
	protected addShort(x: number) {
		//return this.addByte(x >> 8).addByte(x & 0xFF);
		if ((x & 0xFFFF) !== x) throw new Error(`expected short: ${x}`);
		this.ops.push(x >> 8, x & 0xFF);
		return this;
	}
	protected addInputStr(s: string) { return this.addInputBytes(ethers.toUtf8Bytes(s)); }
	protected addInputBytes(v: BytesLike) {
		let hex = ethers.hexlify(v);
		let i = this.inputs.length;
		this.inputs.push(hex);
		return i;
	}
	encode() {
		return ABI_CODER.encode(['bytes', 'bytes[]'], [Uint8Array.from(this.ops), this.inputs]);
	}
	debug(label = '') { return this.addByte(OP_DEBUG).addByte(this.addInputStr(label)); }

	read(n = 1) { return this.addByte(OP_READ_SLOTS).addByte(n); }
	readBytes() { return this.addByte(OP_READ_BYTES); }
	readArray(step: number) { return this.addByte(OP_READ_ARRAY).addShort(step); }

	target() { return this.addByte(OP_TARGET); }
	setOutput(i: number) { return this.addByte(OP_SET_OUTPUT).addByte(i); }
	eval(opts: {
		success?: boolean;
		failure?: boolean;
		acquire?: boolean;
		back?: number;
	} = {}) {
		let flags = 0;
		if (opts.success) flags |= STOP_ON_SUCCESS;
		if (opts.failure) flags |= STOP_ON_FAILURE;
		if (opts.acquire) flags |= ACQUIRE_STATE;
		return this.addByte(OP_EVAL).addByte(opts.back ?? 255).addByte(flags);
	}

	zeroSlot() { return this.addByte(OP_SLOT_ZERO); }
	addSlot() { return this.addByte(OP_SLOT_ADD); }
	follow() { return this.addByte(OP_SLOT_FOLLOW); }

	requireContract() { return this.addByte(OP_REQ_CONTRACT); }
	requireNonzero(back = 0) { return this.addByte(OP_REQ_NONZERO).addByte(back); }

	pop() { return this.addByte(OP_POP); }
	dup(back = 0) { return this.addByte(OP_DUP).addByte(back); }
	
	pushOutput(i: number) { return this.addByte(OP_PUSH_OUTPUT).addByte(i); }
	pushInput(i: number) { return this.addByte(OP_PUSH_INPUT).addByte(i); }
	push(x: BigNumberish) { return this.pushBytes(ethers.toBeHex(x, 32)); }
	pushStr(s: string) { return this.addByte(OP_PUSH_INPUT).addByte(this.addInputStr(s)); }
	pushBytes(v: BytesLike) { return this.addByte(OP_PUSH_INPUT).addByte(this.addInputBytes(v)); }
	pushSlot() { return this.addByte(OP_PUSH_SLOT); }
	pushTarget() { return this.addByte(OP_PUSH_TARGET); }
	
	concat(back: number) { return this.addByte(OP_CONCAT).addByte(back); }
	keccak() { return this.addByte(OP_KECCAK); }
	slice(x: number, n: number) { return this.addByte(OP_SLICE).addShort(x).addShort(n); }
		
	begin() { return new EVMCommand(this); }
	end() {
		let p = this.parent;
		if (!p) throw new Error('no parent');
		this.parent = undefined;
		p.pushBytes(this.encode());
		return p;
	}

	// shorthands?
	offset(x: BigNumberish) { return this.push(x).addSlot(); }
	setTarget(x: HexString) { return this.push(x).target(); }
	setSlot(x: BigNumberish) { return this.zeroSlot().offset(x); }
}

export class EVMRequest extends EVMCommand {
	context: HexString | undefined;
	constructor(outputCount = 0) {
		super(undefined);
		this.addByte(outputCount);
	}
	get outputCount() {
		return this.ops[0];
	}
	addOutput() {
		let i = this.ops[0];
		if (i == 0xFF) throw new Error('output overflow');
		this.ops[0] = i + 1;
		return this.setOutput(i);
	}
	async resolveWith(prover = new EVMProver(undefined as unknown as Provider, '0x')) {
		let state = await prover.evalRequest(this);
		return state.resolveOutputs();
	}
}

export type Need = [target: HexString, slot: bigint];

export class MachineState {
	static create(outputCount: number) {
		return new this(Array(outputCount).fill('0x'), []);
	}
	target = ethers.ZeroAddress;
	slot = 0n;
	stack: MaybeHex[] = [];
	exitCode = 0;
	private readonly targetSet = new Set();
	constructor(
		readonly outputs: MaybeHex[], 
		readonly needs: Need[]
	) {}
	pop() {
		if (!this.stack.length) throw new Error('stack underflow');
		return this.stack.pop()!;
	}
	popSlice(back: number) {
		return back > 0 ? this.stack.splice(-back) : [];
	}
	peek(back: number) {
		if (back >= this.stack.length) throw new Error('stack overflow');
		return this.stack[this.stack.length-1-back]; // from end
	}
	checkOutputIndex(i: number) {
		if (i >= this.outputs.length) throw new Error(`invalid output index: ${i}`);
		return i;
	}
	async resolveOutputs() {
		return Promise.all(this.outputs.map(unwrap));
	}
	traceTarget(target: HexString) {
		//if (!this.needs.length || this.needs[this.needs.length-1][0] != target) {
		this.needs.push([target, ACCOUNT_PROOF_PH]);
		this.targetSet.add(target);
		if (this.targetSet.size > MAX_TARGETS) {
			throw new Error('too many targets');
		}
	}
	traceSlot(target: HexString, slot: bigint) {
		this.needs.push([target, slot]);
	}
	traceSlots(target: HexString, slots: bigint[]) {
		for (let slot of slots) {
			this.traceSlot(target, slot);
		}
	}
}


export class EVMProver {
	static async latest(provider: Provider) {
		let block = await provider.getBlockNumber(); 
		return new this(provider, '0x' + block.toString(16));
	}
	constructor(
		readonly provider: Provider, 
		readonly block: HexString, 
		readonly cache: CachedMap<string,any> = new CachedMap()
	) {}
	checkSize(size: bigint) {
		if (size > MAX_READ_SIZE) throw new Error(`size overflow: ${size} > ${MAX_READ_SIZE}`);
		return Number(size);
	}
	async fetchStateRoot() {
		let block = await this.provider.send('eth_getBlockByNumber', [this.block, false]) as RPCEthGetBlock;
		return block.stateRoot;
	}
	async fetchProofs(target: HexString, slots: bigint[] = []): Promise<RPCEthGetProof> {
		// 20240501: check geth slot limit => no limit, just response size
		// https://github.com/ethereum/go-ethereum/blob/9f96e07c1cf87fdd4d044f95de9c1b5e0b85b47f/internal/ethapi/api.go#L707 
		// TODO: there isn't a good way to cache these unless we do ordered chunks and diff against what's cached
		return this.provider.send('eth_getProof', [target, slots.map(slot => ethers.toBeHex(slot, 32)), this.block]);
	}
	async getStorage(target: HexString, slot: bigint): Promise<HexString> {
		try {
			// check to see if we know this target isn't a contract
			if (await this.cache.cachedValue(target) === false) {
				return ethers.ZeroHash;
			}
		} catch (err) {
		}
		return this.cache.get(`${target}:${slot}`, async () => {
			let value = await this.provider.getStorage(target, slot, this.block)
			if (value !== ethers.ZeroHash) {
				this.cache.set(target, true); // storage exists so it must be a contract
			}
			return value;
		});
	}
	async isContract(target: HexString): Promise<boolean> {
		// NOTE: if eth_getProof with no slots is as cheap as eth_getCode
		// accountProof would be better than code
		return this.cache.get(target, async target => {
			let code = await this.provider.getCode(target, this.block);
			return code.length > 2;
		});
	}
	async prove(needs: Need[]) {
		// reduce an ordered list of needs into a deduplicated list of proofs
		// minimize calls to eth_getProof
		// provide empty proofs for non-contract slots
		type Ref = {id: number, proof: HexString[]};
		type RefMap = Ref & {map: Map<bigint, Ref>};
		let targets = new Map<HexString, RefMap>();
		let refs: Ref[] = [];
		let order = needs.map(([target, slot]) => {
			let bucket = targets.get(target);
			if (slot == ACCOUNT_PROOF_PH) {
				// accountProof
				if (!bucket) {
					bucket = {id: refs.length, proof: [], map: new Map()};
					refs.push(bucket);
					targets.set(target, bucket);
				}
				return bucket.id;
			} else {
				// storageProof (for targeted account)
				// bucket can be undefined if a slot is read without a target
				// this is okay because the initial machine state is NOT_A_CONTRACT
				let ref = bucket?.map.get(slot);
				if (!ref) {
					ref = {id: refs.length, proof: []};
					refs.push(ref);
					bucket?.map.set(slot, ref);
				}
				return ref.id;
			}
		});
		await Promise.all(Array.from(targets, async ([target, bucket]) => {
			let m = [...bucket.map];
			try {
				if (await this.cache.cachedValue(target) === false) {
					m = []; // if we know target isn't a contract, we only need accountProof
				}
			} catch (err) {
			}
			let proof = await this.fetchProofs(target, m.map(([slot]) => slot));
			bucket.proof = proof.accountProof;
			// remember if this target was a contract
			let isContract = !(proof.codeHash === NULL_CODE_HASH || proof.keccakCodeHash === NULL_CODE_HASH);
			this.cache.set(target, isContract);
			if (isContract) {
				m.forEach(([_, ref], i) => ref.proof = proof.storageProof[i].proof);
			}
		}));
		return {
			proofs: refs.map(x => x.proof),
			order: Uint8Array.from(order)
		};
	}
	async evalDecoded(ops: HexString, inputs: HexString[]) {
		return this.evalReader(new CommandReader(ethers.getBytes(ops), inputs));
	}
	async evalRequest(req: EVMRequest) {
		return this.evalReader(CommandReader.fromCommand(req));
	}
	async evalReader(reader: CommandReader) {
		let vm = MachineState.create(reader.readByte());
		await this.evalCommand(reader, vm);
		return vm;
	}
	async evalCommand(reader: CommandReader, vm: MachineState) {
		while (reader.remaining) {
			let op = reader.readByte();
			switch (op) {
				case OP_DEBUG: { // args: [string(label)] / stack: 0
					console.log('DEBUG', ethers.toUtf8String(reader.readInput()), {
						target: vm.target,
						slot: vm.slot,
						exitCode: vm.exitCode,
						stack: await Promise.all(vm.stack.map(unwrap)),
						outputs: await vm.resolveOutputs(),
						needs: vm.needs,
					});
					break;
				}
				case OP_TARGET: { // args: [] / stack: -1
					vm.target = addressFromHex(await unwrap(vm.pop()));
					vm.slot = 0n;
					vm.traceTarget(vm.target); // accountProof
					continue;
				}
				case OP_SLOT_ADD: { // args: [] / stack: -1
					vm.slot += uint256FromHex(await unwrap(vm.pop()));
					continue;
				}
				case OP_SLOT_ZERO: { // args: [] / stack: 0
					vm.slot = 0n;
					continue;
				}
				case OP_SET_OUTPUT: { // args: [outputIndex] / stack: -1
					vm.outputs[vm.checkOutputIndex(reader.readByte())] = vm.pop();
					continue;
				}
				case OP_PUSH_INPUT: { // args: [inputIndex] / stack: 0
					vm.stack.push(reader.readInput());
					continue;
				}
				case OP_PUSH_OUTPUT: { // args: [outputIndex] / stack: +1
					vm.stack.push(vm.outputs[vm.checkOutputIndex(reader.readByte())]);
					continue;
				}
				case OP_PUSH_SLOT: { // args: [] / stack: +1
					vm.stack.push(ethers.toBeHex(vm.slot, 32)); // current slot register
					break;
				}
				case OP_PUSH_TARGET: { // args: [] / stack: +1
					vm.stack.push(vm.target); // current target address
					break;
				}
				case OP_DUP: { // args: [stack(rindex)] / stack: +1
					vm.stack.push(vm.peek(reader.readByte()));
					continue;
				}	
				case OP_POP: { // args: [] / stack: upto(-1)
					vm.stack.pop(); 
					continue;
				}
				case OP_READ_SLOTS: { // args: [count] / stack: +1
					let {target, slot} = vm;
					let slots = bigintRange(slot, reader.readByte());
					vm.traceSlots(target, slots);
					vm.stack.push(slots.length ? new Wrapped(async () => ethers.concat(await Promise.all(slots.map(x => this.getStorage(target, x))))) : '0x');
					continue;
				}
				case OP_READ_BYTES: { // args: [] / stack: +1
					// https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#bytes-and-string
					let {target, slot} = vm;
					vm.traceSlot(target, slot);
					let first = await this.getStorage(target, slot);
					let size = parseInt(first.slice(64), 16); // last byte
					if ((size & 1) == 0) { // small
						vm.stack.push(ethers.dataSlice(first, 0, size >> 1));
					} else {
						size = this.checkSize(BigInt(first) >> 1n);
						let slots = solidityArraySlots(slot, (size + 31) >> 5);
						vm.traceSlots(target, slots);
						vm.stack.push(new Wrapped(async () => ethers.dataSlice(ethers.concat(await Promise.all(slots.map(x => this.getStorage(target, x)))), 0, size)));
					}
					continue;
				}
				case OP_READ_ARRAY: { // args: [] / stack: +1
					let step = reader.readShort();
					if (!step) throw new Error('invalid element size');
					let {target, slot} = vm;
					vm.traceSlot(target, slot);
					let length = this.checkSize(uint256FromHex(await this.getStorage(target, slot)));
					if (step < 32) {
						let per = 32 / step|0;
						length = (length + per - 1) / per|0;
					} else {
						length = length * ((step + 31) >> 5);
					}
					let slots = solidityArraySlots(slot, length);
					vm.traceSlots(target, slots);
					slots.unshift(slot);
					vm.stack.push(new Wrapped(async () => ethers.concat(await Promise.all(slots.map(x => this.getStorage(target, x))))));
					continue;
				}
				case OP_REQ_CONTRACT: {
					if (!await this.isContract(vm.target)) {
						vm.exitCode = 1;
						return;
					}
					continue;
				}
				case OP_REQ_NONZERO: {
					let back = reader.readByte();
					if (/^0x0*$/.test(await unwrap(vm.peek(back)))) {
						vm.exitCode = 1;
						return;
					}
					continue;
				}
				case OP_EVAL: {
					let back = reader.readByte();
					let flags = reader.readByte();
					let cmd = CommandReader.fromEncoded(await unwrap(vm.pop()));
					let args = vm.popSlice(back).toReversed();
					let vm2 = new MachineState(vm.outputs, vm.needs);
					for (let arg of args) {
						vm2.target = vm.target;
						vm2.slot = vm.slot;
						vm2.stack = [arg];
						vm2.exitCode = 0;
						cmd.pos = 0;
						await this.evalCommand(cmd, vm2);
						if (flags & (vm2.exitCode ? STOP_ON_FAILURE : STOP_ON_SUCCESS)) break;
					}
					if (flags & ACQUIRE_STATE) {
						vm.target = vm2.target;
						vm.slot   = vm2.slot;
						vm.stack  = vm2.stack;
					}
					continue;
				}
				case OP_SLOT_FOLLOW: {
					vm.slot = solidityFollowSlot(vm.slot, await unwrap(vm.pop()));
					continue;
				}
				case OP_KECCAK: {
					vm.stack.push(ethers.keccak256(await unwrap(vm.pop())));
					continue;
				}
				case OP_CONCAT: {
					// stack = [..., a, b, c]
					// concat(2) => [..., a ,b+c]
					// concat(4) => [a+b+c]
					let v = vm.popSlice(reader.readByte());
					vm.stack.push(v.length ? new Wrapped(async () => ethers.concat(await Promise.all(v.map(unwrap)))) : '0x');
					continue;
				}
				case OP_SLICE: {
					let x = reader.readShort();
					let n = reader.readShort();
					let v = await unwrap(vm.pop());
					if (x + n > (v.length-2)>>1) throw new Error('slice overflow');
					vm.stack.push(ethers.dataSlice(v, x, x + n));
					continue;
				}
				default: throw new Error(`unknown op: ${op}`);
			}
		}
	}

}
