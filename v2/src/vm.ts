import {ethers} from 'ethers';
import type {HexString, BytesLike, BigNumberish, Provider, MaybeHex, RPCEthGetProof, RPCEthGetBlock} from './types.js';
import {unwrap, Wrapped} from './wrap.js';
import {CachedMap} from './cached.js';

const ABI_CODER = ethers.AbiCoder.defaultAbiCoder();

const MAX_READ_SIZE = 1000;
const MAX_TARGETS = 32;

const NULL_CODE_HASH = ethers.id('');

const STOP_ON_SUCCESS = 1;
const STOP_ON_FAILURE = 2;
const ACQUIRE_STATE = 4;

const OP_DEBUG = 255;
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

// export const GATEWAY_ABI = new ethers.Interface([
// 	`function proveRequest(bytes ops, bytes[] inputs) returns (bytes)`
// ]);

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

export class CommandReader {
	static fromCommand(cmd: EVMCommand) {
		return new this(Uint8Array.from(cmd.ops), [...cmd.inputs]);
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
	toJSON() {
		return {ops: this.ops, inputs: this.inputs};
	}
	addByte(x: number) {
		if ((x & 0xFF) !== x) throw new Error(`expected byte: ${x}`);
		this.ops.push(x);
		return this;
	}
	addShort(x: number) {
		//return this.addByte(x >> 8).addByte(x & 0xFF);
		if ((x & 0xFFFF) !== x) throw new Error(`expected short: ${x}`);
		this.ops.push(x >> 8, x & 0xFF);
		return this;
	}
	addInputStr(s: string) { return this.addInputBytes(ethers.toUtf8Bytes(s)); }
	addInputBytes(v: BytesLike) {
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
	readArray(step: number) { return this.addByte(OP_READ_ARRAY).addByte(step); }

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
		if (!this.stack.length) throw new Error('stack: underflow');
		return this.stack.pop()!;
	}
	popSlice(back: number) {
		return back > 0 ? this.stack.splice(-back) : [];
	}
	peek(back: number) {
		if (back >= this.stack.length) throw new Error('stack: overflow');
		return this.stack[this.stack.length-1-back]; // from end
	}
	checkOutputIndex(i: number) {
		if (i >= this.outputs.length) throw new Error(`invalid output: ${i}`);
		return i;
	}
	async resolveOutputs() {
		return Promise.all(this.outputs.map(unwrap));
	}
	traceTarget(target: HexString) {
		//if (!this.needs.length || this.needs[this.needs.length-1][0] != target) {
		this.needs.push([target, -1n]);
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

function isContractValue(is: boolean) {
	return is ? 'Y' : 'N';
}

export class EVMProver {
	static async latest(provider: Provider) {
		let block = await provider.getBlockNumber(); 
		return new this(provider, '0x' + block.toString(16));
	}
	log: ((...a: any[]) => void) | undefined;
	constructor(
		readonly provider: Provider, 
		readonly block: HexString, 
		readonly cache: CachedMap<string,HexString> = new CachedMap()
	) {}
	checkSize(size: bigint) {
		if (size > MAX_READ_SIZE) throw Object.assign(new Error('overflow: size'), {size, max: MAX_READ_SIZE});
		return Number(size);
	}
	async getStateRoot() {
		let block = await this.provider.send('eth_getBlockByNumber', [this.block, false]) as RPCEthGetBlock;
		return block.stateRoot;
	}
	async getProofs(target: HexString, slots: bigint[] = []): Promise<RPCEthGetProof> {
		return this.provider.send('eth_getProof', [target, slots.map(slot => ethers.toBeHex(slot, 32)), this.block]);
	}
	async getStorage(target: HexString, slot: bigint) {
		try {
			if (await this.cache.cachedValue(target) === 'N') {
				this.log?.(`getStorage(${target}) <skipped>`);
				return ethers.ZeroHash;
			}
		} catch (err) {
		}
		return this.cache.get(`${target}:${slot}`, async () => {
			let value = await this.provider.getStorage(target, slot, this.block)
			this.log?.(`getStorage(${target}, ${ethers.toBeHex(slot, 32)}) = ${value}`);
			if (value !== ethers.ZeroHash) {
				this.cache.set(target, 'Y');
			}
			return value;
		});
	}
	async isContract(target: HexString) {
		return this.cache.get(target, async target => {
			let code = await this.provider.getCode(target, this.block);
			let is = isContractValue(code.length > 2);
			this.log?.(`isContract(${target}) = ${is}`);
			return is;
		});
	}
	async prove(needs: Need[]) {
		type Ref = {id: number, proof?: HexString[]};
		type RefMap = Ref & {map: Map<bigint, Ref>};
		let targets = new Map<HexString, RefMap>();
		let refs: Ref[] = [];
		let order = needs.map(([target, slot]) => {
			let bucket = targets.get(target);
			if (slot >= 0) {
				if (!bucket) throw new Error('unreachable');
				let ref = bucket.map.get(slot);
				if (!ref) {
					ref = {id: refs.length};
					refs.push(ref);
					bucket.map.set(slot, ref);
				}
				return ref.id;
			} else {
				if (!bucket) {
					bucket = {
						map: new Map(),
						id: refs.length
					};
					refs.push(bucket);
					targets.set(target, bucket);
				}
				return bucket.id;
			}
		});
		await Promise.all(Array.from(targets, async ([target, bucket]) => {
			let m = [...bucket.map];
			let proof = await this.getProofs(target, m.map(([slot]) => slot));
			bucket.proof = proof.accountProof;
			let is_contract = !(proof.codeHash === NULL_CODE_HASH || proof.keccakCodeHash === NULL_CODE_HASH);
			this.cache.set(target, isContractValue(is_contract));
			m.forEach(([_, ref], i) => ref.proof = is_contract ? proof.storageProof[i].proof : []);
		}));
		return {
			proofs: refs.map(x => x.proof!),
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
				case OP_DEBUG: {
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
				case OP_TARGET: {
					vm.target = addressFromHex(await unwrap(vm.pop()));
					vm.slot = 0n;
					vm.traceTarget(vm.target);
					continue;
				}
				case OP_SLOT_ADD: {
					vm.slot += uint256FromHex(await unwrap(vm.pop()));
					continue;
				}
				case OP_SLOT_ZERO: {
					vm.slot = 0n;
					continue;
				}
				case OP_SET_OUTPUT: {
					vm.outputs[vm.checkOutputIndex(reader.readByte())] = vm.pop();
					continue;
				}
				case OP_PUSH_INPUT: {
					vm.stack.push(reader.readInput());
					continue;
				}
				case OP_PUSH_OUTPUT: {
					vm.stack.push(vm.outputs[vm.checkOutputIndex(reader.readByte())]);
					continue;
				}
				case OP_PUSH_SLOT: {
					vm.stack.push(ethers.toBeHex(vm.slot, 32));
					break;
				}
				case OP_PUSH_TARGET: {
					vm.stack.push(vm.target);
					break;
				}
				case OP_DUP: {
					vm.stack.push(vm.peek(reader.readByte()));
					continue;
				}	
				case OP_POP: {
					vm.pop();
					continue;
				}
				case OP_READ_SLOTS: {
					let length = reader.readByte();
					if (!length) throw new Error(`empty read`);
					let {target, slot} = vm;
					let slots = bigintRange(slot, length);
					vm.traceSlots(target, slots);
					vm.stack.push(new Wrapped(async () => ethers.concat(await Promise.all(slots.map(x => this.getStorage(target, x))))));
					continue;
				}
				case OP_READ_BYTES: {
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
				case OP_READ_ARRAY: {
					let step = reader.readByte();
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
					let slots = [slot, ...solidityArraySlots(slot, length)];
					vm.traceSlots(target, slots);
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
					vm.slot = BigInt(ethers.keccak256(ethers.concat([await unwrap(vm.pop()), ethers.toBeHex(vm.slot, 32)])));
					continue;
				}
				case OP_KECCAK: {
					vm.stack.push(ethers.keccak256(await unwrap(vm.pop())));
					continue;
				}
				case OP_CONCAT: {
					let v = vm.popSlice(reader.readByte());
					vm.stack.push(v.length ? new Wrapped(async () => ethers.concat(await Promise.all(v.map(unwrap)))) : '0x');
					continue;
				}
				case OP_SLICE: {
					let x = reader.readShort();
					let n = reader.readShort();
					vm.stack.push(ethers.dataSlice(await unwrap(vm.pop()), x, x + n));
					continue;
				}
				default: throw new Error(`unknown op: ${op}`);
			}
		}
		return vm;
	}

}
