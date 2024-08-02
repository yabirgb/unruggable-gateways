import type {
  HexString,
  BytesLike,
  BigNumberish,
  Provider,
  RPCEthGetProof,
  RPCEthGetBlock,
  Proof,
  EncodedProof,
} from './types.js';
import { ethers } from 'ethers';
import { unwrap, Wrapped, type Unwrappable } from './wrap.js';
import { CachedMap } from './cached.js';

// all addresses are lowercase
// all values are hex-strings

type HexFuture = Unwrappable<HexString>;

const ABI_CODER = ethers.AbiCoder.defaultAbiCoder();

// maximum number of items on stack
// the following should be equivalent to EVMProtocol.sol
export const MAX_STACK = 64;

// OP_EVAL flags
// the following should be equivalent to EVMProtocol.sol
const STOP_ON_SUCCESS = 1;
const STOP_ON_FAILURE = 2;
const ACQUIRE_STATE = 4;

// EVMRequest operations
// specific ids just need to be unique
// the following should be equivalent to EVMProtocol.sol
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

const NULL_CODE_HASH = ethers.id('');
const ACCOUNT_PROOF_PH = -1n;

function uint256FromHex(hex: string) {
  // the following should be equivalent to ProofUtils.uint256FromBytes(hex)
  return hex === '0x' ? 0n : BigInt(hex.slice(0, 66));
}
function addressFromHex(hex: string) {
  // the following should be equivalent to: address(uint160(ProofUtils.uint256FromBytes(hex)))
  return (
    '0x' +
    (hex.length >= 66
      ? hex.slice(26, 66)
      : hex.slice(2).padStart(40, '0').slice(-40)
    ).toLowerCase()
  );
}
function bigintRange(start: bigint, length: number) {
  return Array.from({ length }, (_, i) => start + BigInt(i));
}
function solidityArraySlots(slot: BigNumberish, length: number) {
  return length
    ? bigintRange(
        BigInt(ethers.solidityPackedKeccak256(['uint256'], [slot])),
        length
      )
    : [];
}
export function solidityFollowSlot(slot: BigNumberish, key: BytesLike) {
  // https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#mappings-and-dynamic-arrays
  return BigInt(
    ethers.keccak256(ethers.concat([key, ethers.toBeHex(slot, 32)]))
  );
}

// read an EVMCommand ops buffer
export class CommandReader {
  static fromCommand(cmd: EVMCommand) {
    return new this(Uint8Array.from(cmd.ops), cmd.inputs.slice());
  }
  static fromEncoded(hex: HexString) {
    const [ops, inputs] = ABI_CODER.decode(['bytes', 'bytes[]'], hex);
    return new this(ethers.getBytes(ops), [...inputs]);
  }
  pos: number = 0;
  constructor(
    readonly ops: Uint8Array,
    readonly inputs: HexString[]
  ) {}
  get remaining() {
    return this.ops.length - this.pos;
  }
  checkRead(n: number) {
    if (this.pos + n > this.ops.length) throw new Error('reader overflow');
  }
  readByte() {
    this.checkRead(1);
    return this.ops[this.pos++];
  }
  readShort() {
    return (this.readByte() << 8) | this.readByte();
  }
  readBytes() {
    const n = this.readShort();
    this.checkRead(n);
    return ethers.hexlify(this.ops.subarray(this.pos, (this.pos += n)));
  }
  readInput() {
    const i = this.readByte();
    if (i >= this.inputs.length) throw new Error(`invalid input index: ${i}`);
    return this.inputs[i];
  }
}

export class EVMCommand {
  constructor(
    private parent: EVMCommand | undefined = undefined,
    readonly ops: number[] = [],
    readonly inputs: string[] = []
  ) {}
  clone() {
    return new EVMCommand(this.parent, this.ops.slice(), this.inputs.slice());
  }
  protected addByte(x: number) {
    if ((x & 0xff) !== x) throw new Error(`expected byte: ${x}`);
    this.ops.push(x);
    return this;
  }
  protected addShort(x: number) {
    //return this.addByte(x >> 8).addByte(x & 0xFF);
    if ((x & 0xffff) !== x) throw new Error(`expected short: ${x}`);
    this.ops.push(x >> 8, x & 0xff);
    return this;
  }
  addInput(x: BigNumberish) {
    return this.addInputBytes(ethers.toBeHex(x, 32));
  }
  addInputStr(s: string) {
    return this.addInputBytes(ethers.toUtf8Bytes(s));
  }
  addInputBytes(v: BytesLike) {
    const hex = ethers.hexlify(v);
    const i = this.inputs.length;
    this.inputs.push(hex); // note: no check, but blows up at 256
    return i;
  }
  encode() {
    return ABI_CODER.encode(
      ['bytes', 'bytes[]'],
      [Uint8Array.from(this.ops), this.inputs]
    );
  }
  debug(label = '') {
    return this.addByte(OP_DEBUG).addByte(this.addInputStr(label));
  }

  read(n = 1) {
    return this.addByte(OP_READ_SLOTS).addByte(n);
  }
  readBytes() {
    return this.addByte(OP_READ_BYTES);
  }
  readArray(step: number) {
    return this.addByte(OP_READ_ARRAY).addShort(step);
  }

  target() {
    return this.addByte(OP_TARGET);
  }
  setOutput(i: number) {
    return this.addByte(OP_SET_OUTPUT).addByte(i);
  }
  eval(
    opts: {
      success?: boolean;
      failure?: boolean;
      acquire?: boolean;
      back?: number;
    } = {}
  ) {
    let flags = 0;
    if (opts.success) flags |= STOP_ON_SUCCESS;
    if (opts.failure) flags |= STOP_ON_FAILURE;
    if (opts.acquire) flags |= ACQUIRE_STATE;
    return this.addByte(OP_EVAL)
      .addByte(opts.back ?? 255)
      .addByte(flags);
  }

  zeroSlot() {
    return this.addByte(OP_SLOT_ZERO);
  }
  addSlot() {
    return this.addByte(OP_SLOT_ADD);
  }
  follow() {
    return this.addByte(OP_SLOT_FOLLOW);
  }

  requireContract() {
    return this.addByte(OP_REQ_CONTRACT);
  }
  requireNonzero(back = 0) {
    return this.addByte(OP_REQ_NONZERO).addByte(back);
  }

  pop() {
    return this.addByte(OP_POP);
  }
  dup(back = 0) {
    return this.addByte(OP_DUP).addByte(back);
  }

  pushOutput(i: number) {
    return this.addByte(OP_PUSH_OUTPUT).addByte(i);
  }
  pushInput(i: number) {
    return this.addByte(OP_PUSH_INPUT).addByte(i);
  }
  push(x: BigNumberish) {
    return this.addByte(OP_PUSH_INPUT).addByte(this.addInput(x));
  }
  pushStr(s: string) {
    return this.addByte(OP_PUSH_INPUT).addByte(this.addInputStr(s));
  }
  pushBytes(v: BytesLike) {
    return this.addByte(OP_PUSH_INPUT).addByte(this.addInputBytes(v));
  }
  //pushCommand(cmd: EVMCommand) { return this.pushBytes(cmd.encode()); }
  pushSlot() {
    return this.addByte(OP_PUSH_SLOT);
  }
  pushTarget() {
    return this.addByte(OP_PUSH_TARGET);
  }

  concat(back: number) {
    return this.addByte(OP_CONCAT).addByte(back);
  }
  keccak() {
    return this.addByte(OP_KECCAK);
  }
  slice(x: number, n: number) {
    return this.addByte(OP_SLICE).addShort(x).addShort(n);
  }

  // experimental syntax
  // alternative: pushCommand()
  begin() {
    return new EVMCommand(this);
  }
  end() {
    const p = this.parent;
    if (!p) throw new Error('no parent');
    this.parent = undefined;
    p.pushBytes(this.encode());
    return p;
  }

  // shorthands?
  offset(x: BigNumberish) {
    return this.push(x).addSlot();
  }
  setTarget(x: HexString) {
    return this.push(x).target();
  }
  setSlot(x: BigNumberish) {
    return this.zeroSlot().offset(x);
  }
}

// a request is just a command where the leading byte is the number of outputs
export class EVMRequest extends EVMCommand {
  context: HexString | undefined;
  constructor(outputCount = 0) {
    super(undefined);
    this.addByte(outputCount);
  }
  get outputCount() {
    return this.ops[0];
  }
  // convenience for writing JS-based requests
  // (this functionality is not available in solidity)
  addOutput() {
    const i = this.ops[0];
    if (i == 0xff) throw new Error('output overflow');
    this.ops[0] = i + 1;
    return this.setOutput(i);
  }
  // experimential
  // evaluate a request inline
  // if no data is required (pure computation) no provider is required
  async resolveWith(
    prover = new EVMProver(undefined as unknown as Provider, '0x')
  ) {
    const state = await prover.evalRequest(this);
    return state.resolveOutputs();
  }
}

export type Need = [target: HexString, slot: bigint];

export type ProofSequence = {
  proofs: EncodedProof[];
  order: Uint8Array;
};

// tracks the state of an EVMCommand evaluation
// registers: [slot, target, stack]
// outputs are shared across eval()
// needs records sequence of necessary proofs
export class MachineState {
  static create(outputCount: number) {
    return new this(Array(outputCount).fill('0x'));
  }
  target = ethers.ZeroAddress;
  slot = 0n;
  stack: HexFuture[] = [];
  exitCode = 0;
  constructor(
    readonly outputs: HexFuture[],
    readonly needs: Need[] = [],
    readonly targetSet = new Set<HexString>()
  ) {}
  checkOutputIndex(i: number) {
    if (i >= this.outputs.length) throw new Error(`invalid output index: ${i}`);
    return i;
  }
  async resolveOutputs() {
    return Promise.all(this.outputs.map(unwrap));
  }
  push(value: HexFuture) {
    if (this.stack.length == MAX_STACK) throw new Error('stack overflow');
    this.stack.push(value);
  }
  pop() {
    if (!this.stack.length) throw new Error('stack underflow');
    return this.stack.pop()!;
  }
  popSlice(back: number) {
    return back > 0 ? this.stack.splice(-back) : [];
  }
  peek(back: number) {
    return back < this.stack.length
      ? this.stack[this.stack.length - 1 - back]
      : '0x';
  }
  traceTarget(target: HexString, max: number) {
    // IDEA: this could incremently build the needs map
    // instead of doing it during prove()
    this.needs.push([target, ACCOUNT_PROOF_PH]); // special value indicate accountProof instead of slot
    this.targetSet.add(target);
    if (this.targetSet.size > max) {
      throw new Error('too many targets');
    }
  }
  traceSlot(target: HexString, slot: bigint) {
    this.needs.push([target, slot]);
  }
  traceSlots(target: HexString, slots: bigint[]) {
    for (const slot of slots) {
      this.traceSlot(target, slot);
    }
  }
}

type EthAccountProof = Omit<RPCEthGetProof, 'storageProof'>;
type EthStorageProof = RPCEthGetProof['storageProof'][0];

function makeStorageKey(target: HexString, slot: bigint) {
  return `${target}:${slot.toString(16)}`;
}
function isContract(proof: EthAccountProof) {
  return !(
    proof.codeHash === NULL_CODE_HASH || proof.keccakCodeHash === NULL_CODE_HASH
  );
}

export abstract class AbstractProver {
  // maximum number of bytes from single read()
  // this is also constrained by proof count (1 proof per 32 bytes)
  maxReadBytes = 32 * 32; // unlimited
  // maximum number of proofs (M account + N storage, max 256)
  // if this number is too small, protocol can be changed to uint16
  maxUniqueProofs = 128; // max(256)
  // maximum number of targets (accountProofs)
  maxUniqueTargets = 32; // unlimited
  proofBatchSize = 64;
  // use getStorage() if no proof is cached yet
  useFastCalls = true;
  // how long to keep fast call values
  fastCallCacheMs = 0; // never cache
  checkSize(size: bigint | number) {
    if (size > this.maxReadBytes)
      throw new Error(`too many bytes: ${size} > ${this.maxReadBytes}`);
    return Number(size);
  }
  abstract isContract(target: HexString): Promise<boolean>;
  abstract getStorage(target: HexString, slot: bigint): Promise<HexString>;
  abstract prove(needs: Need[]): Promise<ProofSequence>;
  async evalDecoded(ops: HexString, inputs: HexString[]) {
    return this.evalReader(new CommandReader(ethers.getBytes(ops), inputs));
  }
  async evalRequest(req: EVMRequest) {
    return this.evalReader(CommandReader.fromCommand(req));
  }
  async evalReader(reader: CommandReader) {
    const vm = MachineState.create(reader.readByte());
    await this.evalCommand(reader, vm);
    return vm;
  }
  async evalCommand(reader: CommandReader, vm: MachineState) {
    while (reader.remaining) {
      const op = reader.readByte();
      switch (op) {
        case OP_DEBUG: {
          // args: [string(label)] / stack: 0
          console.log('DEBUG', ethers.toUtf8String(reader.readInput()), {
            target: vm.target,
            slot: vm.slot,
            exitCode: vm.exitCode,
            stack: await Promise.all(vm.stack.map(unwrap)),
            outputs: await vm.resolveOutputs(),
            needs: vm.needs,
          });
          continue;
        }
        case OP_TARGET: {
          // args: [] / stack: -1
          vm.target = addressFromHex(await unwrap(vm.pop()));
          vm.slot = 0n;
          vm.traceTarget(vm.target, this.maxUniqueTargets); // accountProof
          continue;
        }
        case OP_SLOT_ADD: {
          // args: [] / stack: -1
          vm.slot += uint256FromHex(await unwrap(vm.pop()));
          continue;
        }
        case OP_SLOT_ZERO: {
          // args: [] / stack: 0
          vm.slot = 0n;
          continue;
        }
        case OP_SET_OUTPUT: {
          // args: [outputIndex] / stack: -1
          vm.outputs[vm.checkOutputIndex(reader.readByte())] = vm.pop();
          continue;
        }
        case OP_PUSH_INPUT: {
          // args: [inputIndex] / stack: 0
          vm.push(reader.readInput());
          continue;
        }
        case OP_PUSH_OUTPUT: {
          // args: [outputIndex] / stack: +1
          vm.push(vm.outputs[vm.checkOutputIndex(reader.readByte())]);
          continue;
        }
        case OP_PUSH_SLOT: {
          // args: [] / stack: +1
          vm.push(ethers.toBeHex(vm.slot, 32)); // current slot register
          continue;
        }
        case OP_PUSH_TARGET: {
          // args: [] / stack: +1
          vm.push(vm.target); // current target address
          continue;
        }
        case OP_DUP: {
          // args: [stack(rindex)] / stack: +1
          vm.push(vm.peek(reader.readByte()));
          continue;
        }
        case OP_POP: {
          // args: [] / stack: upto(-1)
          vm.stack.pop();
          continue;
        }
        case OP_READ_SLOTS: {
          // args: [count] / stack: +1
          const { target, slot } = vm;
          const count = reader.readByte();
          this.checkSize(count << 5);
          const slots = bigintRange(slot, count);
          vm.traceSlots(target, slots);
          vm.push(
            slots.length
              ? new Wrapped(async () =>
                  ethers.concat(
                    await Promise.all(
                      slots.map((x) => this.getStorage(target, x))
                    )
                  )
                )
              : '0x'
          );
          continue;
        }
        case OP_READ_BYTES: {
          // args: [] / stack: +1
          // https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#bytes-and-string
          const { target, slot } = vm;
          vm.traceSlot(target, slot);
          const first = await this.getStorage(target, slot);
          let size = parseInt(first.slice(64), 16); // last byte
          if ((size & 1) == 0) {
            // small
            vm.push(ethers.dataSlice(first, 0, size >> 1));
          } else {
            size = this.checkSize(BigInt(first) >> 1n);
            const slots = solidityArraySlots(slot, (size + 31) >> 5);
            vm.traceSlots(target, slots);
            vm.push(
              new Wrapped(async () =>
                ethers.dataSlice(
                  ethers.concat(
                    await Promise.all(
                      slots.map((x) => this.getStorage(target, x))
                    )
                  ),
                  0,
                  size
                )
              )
            );
          }
          continue;
        }
        case OP_READ_ARRAY: {
          // args: [] / stack: +1
          const step = reader.readShort();
          if (!step) throw new Error('invalid element size');
          const { target, slot } = vm;
          vm.traceSlot(target, slot);
          let length = this.checkSize(
            uint256FromHex(await this.getStorage(target, slot))
          );
          if (step < 32) {
            const per = (32 / step) | 0;
            length = ((length + per - 1) / per) | 0;
          } else {
            length = length * ((step + 31) >> 5);
          }
          const slots = solidityArraySlots(slot, length);
          vm.traceSlots(target, slots);
          slots.unshift(slot);
          vm.push(
            new Wrapped(async () =>
              ethers.concat(
                await Promise.all(slots.map((x) => this.getStorage(target, x)))
              )
            )
          );
          continue;
        }
        case OP_REQ_CONTRACT: {
          // args: [] / stack: 0
          if (!(await this.isContract(vm.target))) {
            vm.exitCode = 1;
            return;
          }
          continue;
        }
        case OP_REQ_NONZERO: {
          // args: [back] / stack: 0
          const back = reader.readByte();
          if (/^0x0*$/.test(await unwrap(vm.peek(back)))) {
            vm.exitCode = 1;
            return;
          }
          continue;
        }
        case OP_EVAL: {
          // args: [back, flags] / stack: -1 (program) & -back (args)
          const back = reader.readByte();
          const flags = reader.readByte();
          const cmd = CommandReader.fromEncoded(await unwrap(vm.pop()));
          const args = vm.popSlice(back).toReversed();
          const vm2 = new MachineState(vm.outputs, vm.needs, vm.targetSet);
          for (const arg of args) {
            vm2.target = vm.target;
            vm2.slot = vm.slot;
            vm2.stack = [arg];
            vm2.exitCode = 0;
            cmd.pos = 0;
            await this.evalCommand(cmd, vm2);
            if (flags & (vm2.exitCode ? STOP_ON_FAILURE : STOP_ON_SUCCESS))
              break;
          }
          if (flags & ACQUIRE_STATE) {
            vm.target = vm2.target;
            vm.slot = vm2.slot;
            vm.stack = vm2.stack;
          }
          continue;
        }
        case OP_SLOT_FOLLOW: {
          // args: [] / stack: -1
          vm.slot = solidityFollowSlot(vm.slot, await unwrap(vm.pop()));
          continue;
        }
        case OP_KECCAK: {
          // args: [] / stack: 0
          vm.push(ethers.keccak256(await unwrap(vm.pop())));
          continue;
        }
        case OP_CONCAT: {
          // args: [back]
          //        stack = [a, b, c]
          // => concat(2) = [a, b+c]
          // => concat(4) = [a+b+c]
          // => concat(0) = [a, b, c, 0x]
          const v = vm.popSlice(reader.readByte());
          vm.push(
            v.length
              ? new Wrapped(async () =>
                  ethers.concat(await Promise.all(v.map(unwrap)))
                )
              : '0x'
          );
          continue;
        }
        case OP_SLICE: {
          // args: [off, size] / stack: 0
          const x = reader.readShort();
          const n = reader.readShort();
          const v = await unwrap(vm.pop());
          if (x + n > (v.length - 2) >> 1) throw new Error('slice overflow');
          vm.push(ethers.dataSlice(v, x, x + n));
          continue;
        }
        default: {
          throw new Error(`unknown op: ${op}`);
        }
      }
    }
  }
}

export class EVMProver extends AbstractProver {
  static async latest(provider: Provider) {
    const block = await provider.getBlockNumber();
    return new this(provider, '0x' + block.toString(16));
  }
  constructor(
    readonly provider: Provider,
    readonly block: HexString,
    readonly cache: CachedMap<string, any> = new CachedMap()
  ) {
    super();
  }
  async cachedMap() {
    const map = new Map<HexString, bigint[]>();
    for (const key of this.cache.cachedKeys()) {
      const value = await this.cache.cachedValue(key);
      const target = key.slice(0, 42);
      let bucket = map.get(target);
      if (!bucket) {
        bucket = [];
        map.set(target, bucket);
      }
      if (key.length == 42) {
        //bucket.push(isContract(value as AccountProof));
        // non-contracts will be empty lists
      } else {
        bucket.push(BigInt((value as EthStorageProof).key));
        //bucket.push(BigInt('0x' + key.slice(43)))
      }
    }
    return map;
  }
  async fetchStateRoot() {
    // this is just a convenience
    const block = (await this.provider.send('eth_getBlockByNumber', [
      this.block,
      false,
    ])) as RPCEthGetBlock;
    return block.stateRoot;
  }
  async fetchProofs(
    target: HexString,
    slots: bigint[] = []
  ): Promise<RPCEthGetProof> {
    const ps: Promise<RPCEthGetProof>[] = [];
    for (let i = 0; ; ) {
      ps.push(
        this.provider.send('eth_getProof', [
          target,
          slots
            .slice(i, (i += this.proofBatchSize))
            .map((slot) => ethers.toBeHex(slot, 32)),
          this.block,
        ])
      );
      if (i >= slots.length) break;
    }
    const vs = await Promise.all(ps);
    for (let i = 1; i < vs.length; i++) {
      vs[0].storageProof.push(...vs[i].storageProof);
    }
    return vs[0];
  }
  async getProofs(
    target: HexString,
    slots: bigint[] = []
  ): Promise<RPCEthGetProof> {
    target = target.toLowerCase();
    const missing: number[] = []; // indices of slots we dont have proofs for
    const { promise, resolve, reject } = Promise.withResolvers(); // create a blocker
    // 20240708: must setup blocks before await
    let accountProof: Promise<EthAccountProof> | EthAccountProof | undefined =
      this.cache.peek(target);
    if (!accountProof) {
      this.cache.set(
        target,
        promise.then(() => accountProof) // block
      );
    }
    const storageProofs: (
      | Promise<EthStorageProof>
      | EthStorageProof
      | undefined
    )[] = slots.map((slot, i) => {
      const key = makeStorageKey(target, slot);
      const p = this.cache.peek(key);
      if (!p) {
        this.cache.set(
          key,
          promise.then(() => storageProofs[i]) // block
        );
        missing.push(i);
      }
      return p;
    });
    if (!accountProof || missing.length) {
      // we need something
      try {
        const { storageProof: v, ...a } = await this.fetchProofs(
          target,
          missing.map((x) => slots[x])
        );
        // update cache
        accountProof = a;
        missing.forEach((x, i) => (storageProofs[x] = v[i]));
        resolve(); // unblock
      } catch (err) {
        reject(err);
      }
    }
    // reassemble eth_getProof
    const [a, v] = await Promise.all([
      accountProof as Promise<EthAccountProof>,
      Promise.all(storageProofs) as Promise<EthStorageProof[]>,
    ]);
    return { storageProof: v, ...a };
  }
  override async getStorage(
    target: HexString,
    slot: bigint
  ): Promise<HexString> {
    // check to see if we know this target isn't a contract without invoking provider
    // this is almost equivalent to: await isContract(target)
    const accountProof: EthAccountProof | undefined =
      await this.cache.peek(target);
    if (accountProof && !isContract(accountProof)) {
      return ethers.ZeroHash;
    }
    // check to see if we've already have a proof for this value
    const storageKey = makeStorageKey(target, slot);
    const storageProof: EthStorageProof | undefined = await (this.useFastCalls
      ? this.cache.peek(storageKey)
      : this.cache.get(storageKey, async () => {
          const proofs = await this.getProofs(target, [slot]);
          return proofs.storageProof[0];
        }));
    if (storageProof) {
      return ethers.toBeHex(storageProof.value, 32);
    }
    // we didn't have the proof
    // lets just get the value for now and prove it later
    return this.cache.get(
      storageKey + '!',
      async () => this.provider.getStorage(target, slot),
      this.fastCallCacheMs
    );
  }
  override async isContract(target: HexString) {
    return isContract(await this.getProofs(target, []));
  }
  override async prove(needs: Need[]) {
    // reduce an ordered list of needs into a deduplicated list of proofs
    // minimize calls to eth_getProof
    // provide empty proofs for non-contract slots
    type Ref = { id: number; proof: Proof };
    type RefMap = Ref & { map: Map<bigint, Ref> };
    const targets = new Map<HexString, RefMap>();
    const refs: Ref[] = [];
    const order = needs.map(([target, slot]) => {
      let bucket = targets.get(target);
      if (slot == ACCOUNT_PROOF_PH) {
        // accountProof
        if (!bucket) {
          bucket = { id: refs.length, proof: [], map: new Map() };
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
          ref = { id: refs.length, proof: [] };
          refs.push(ref);
          bucket?.map.set(slot, ref);
        }
        return ref.id;
      }
    });
    if (refs.length > this.maxUniqueProofs) {
      throw new Error(
        `too many proofs: ${refs.length} > ${this.maxUniqueProofs}`
      );
    }
    await Promise.all(
      Array.from(targets, async ([target, bucket]) => {
        let m = [...bucket.map];
        try {
          const accountProof: EthAccountProof | undefined =
            await this.cache.cachedValue(target);
          if (accountProof && !isContract(accountProof)) {
            m = []; // if we know target isn't a contract, we only need accountProof
          }
        } catch (err) {
          /*empty*/
        }
        const proofs = await this.getProofs(
          target,
          m.map(([slot]) => slot)
        );
        bucket.proof = proofs.accountProof;
        if (isContract(proofs)) {
          m.forEach(([, ref], i) => (ref.proof = proofs.storageProof[i].proof));
        }
      })
    );
    return {
      proofs: refs.map((x) => ABI_CODER.encode(['bytes[]'], [x.proof])),
      order: Uint8Array.from(order),
    };
  }
}

type ZKSyncStorageProof = {
  index: number;
  key: HexString;
  proof: Proof;
  value: HexString;
};

type RPCZKSyncGetProof = {
  address: HexString;
  storageProof: ZKSyncStorageProof[];
};

// https://docs.zksync.io/build/api-reference/zks-rpc#zks_getproof
const ZKSYNC_ACCOUNT_CODEHASH = '0x0000000000000000000000000000000000008002';

function encodeZKStorageProof(proof: ZKSyncStorageProof) {
  return ABI_CODER.encode(
    ['bytes32', 'uint64', 'bytes32[]'],
    [proof.value, proof.index, proof.proof]
  );
}

export class ZKSyncProver extends AbstractProver {
  static async latest(provider: Provider) {
    return new this(
      provider,
      parseInt(await provider.send('zks_L1BatchNumber', []))
    );
  }
  constructor(
    readonly provider: Provider,
    readonly batchNumber: number,
    readonly cache: CachedMap<string, any> = new CachedMap()
  ) {
    super();
  }
  override async isContract(target: HexString): Promise<boolean> {
    const storageProof: ZKSyncStorageProof | undefined =
      await this.cache.peek(target);
    const codeHash = storageProof
      ? storageProof.value
      : await this.getStorage(ZKSYNC_ACCOUNT_CODEHASH, BigInt(target));
    return /^0x0+$/.test(codeHash);
  }
  override async getStorage(
    target: HexString,
    slot: bigint
  ): Promise<HexString> {
    const storageKey = makeStorageKey(target, slot);
    const storageProof: ZKSyncStorageProof | undefined = await (this
      .useFastCalls
      ? this.cache.peek(storageKey)
      : this.cache.get(storageKey, async () => {
          const vs = await this.getStorageProofs(target, [slot]);
          return vs[0];
        }));
    if (storageProof) {
      return storageProof.value;
    }
    return this.cache.get(
      storageKey + '!',
      async () => this.provider.getStorage(target, slot),
      this.fastCallCacheMs
    );
  }
  override async prove(needs: Need[]): Promise<ProofSequence> {
    type Ref = { id: number; proof: EncodedProof };
    const targets = new Map<HexString, Map<bigint, Ref>>();
    const refs: Ref[] = [];
    const order = needs.map(([target, slot]) => {
      if (slot === ACCOUNT_PROOF_PH) {
        slot = BigInt(target);
        target = ZKSYNC_ACCOUNT_CODEHASH;
      }
      let bucket = targets.get(target);
      if (!bucket) {
        bucket = new Map();
        targets.set(target, bucket);
      }
      let ref = bucket.get(slot);
      if (!ref) {
        ref = { id: refs.length, proof: '0x' };
        refs.push(ref);
        bucket.set(slot, ref);
      }
      return ref.id;
    });
    await Promise.all(
      Array.from(targets, async ([target, map]) => {
        const m = [...map];
        const proofs = await this.getStorageProofs(
          target,
          m.map(([slot]) => slot)
        );
        m.forEach(
          ([, ref], i) => (ref.proof = encodeZKStorageProof(proofs[i]))
        );
      })
    );
    return {
      proofs: refs.map((x) => x.proof),
      order: Uint8Array.from(order),
    };
  }
  async getStorageProofs(target: HexString, slots: bigint[]) {
    const missing: number[] = [];
    const { promise, resolve, reject } = Promise.withResolvers();
    const storageProofs: (
      | Promise<ZKSyncStorageProof>
      | ZKSyncStorageProof
      | undefined
    )[] = slots.map((slot, i) => {
      const key = makeStorageKey(target, slot);
      const p = this.cache.peek(key);
      if (!p) {
        this.cache.set(
          key,
          promise.then(() => storageProofs[i])
        );
        missing.push(i);
      }
      return p;
    });
    if (missing.length) {
      try {
        const vs = await this.fetchStorageProofs(
          target,
          missing.map((x) => slots[x])
        );
        missing.forEach((x, i) => (storageProofs[x] = vs[i]));
        resolve();
      } catch (err) {
        reject(err);
      }
    }
    return Promise.all(storageProofs) as Promise<ZKSyncStorageProof[]>;
  }
  async fetchStorageProofs(target: HexString, slots: bigint[]) {
    const ps: Promise<RPCZKSyncGetProof>[] = [];
    for (let i = 0; i < slots.length; ) {
      ps.push(
        this.provider.send('zks_getProof', [
          target,
          slots
            .slice(i, (i += this.proofBatchSize))
            .map((slot) => ethers.toBeHex(slot, 32)),
          this.batchNumber,
        ])
      );
    }
    const vs = await Promise.all(ps);
    return vs.flatMap((x) => x.storageProof);
  }
}
