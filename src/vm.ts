import type {
  BigNumberish,
  BytesLike,
  HexAddress,
  HexString,
  ProofRef,
  ProofSequence,
  ProofSequenceV1,
  Provider,
} from './types.js';
import { ZeroAddress } from 'ethers/constants';
import { Contract } from 'ethers/contract';
import { Interface } from 'ethers/abi';
import { keccak256 } from 'ethers/crypto';
import { solidityPackedKeccak256 } from 'ethers/hash';
import {
  hexlify,
  toBeHex,
  dataSlice,
  concat,
  getBytes,
  toUtf8Bytes,
  toUtf8String,
} from 'ethers/utils';
import { unwrap, Wrapped, type Unwrappable } from './wrap.js';
import { ABI_CODER, fetchBlock, toString16 } from './utils.js';
import { CachedMap, LRU } from './cached.js';

// all addresses are lowercase
// all values are hex-strings

type HexFuture = Unwrappable<HexString>;

// maximum number of items on stack
// the following should be equivalent to GatewayProtocol.sol
export const MAX_STACK = 64;

// OP_EVAL_LOOP flags
// the following should be equivalent to GatewayProtocol.sol
const STOP_ON_SUCCESS = 1;
const STOP_ON_FAILURE = 2;
const ACQUIRE_STATE = 4;

// program ops
// specific ids just need to be unique
// the following should be equivalent to GatewayProtocol.sol
const OP_DEBUG = 255; // experimental
const OP_TARGET = 1;
const OP_SET_OUTPUT = 2;
const OP_EVAL_LOOP = 3;
const OP_EVAL_INLINE = 4;

const OP_REQ_NONZERO = 10;
const OP_REQ_CONTRACT = 11;

const OP_READ_SLOTS = 20;
const OP_READ_BYTES = 21;
const OP_READ_ARRAY = 22;
const OP_READ_HASHED = 23;

const OP_SLOT_ZERO = 30;
const OP_SLOT_ADD = 31;
const OP_SLOT_FOLLOW = 32;

const OP_PUSH_INPUT = 40;
const OP_PUSH_OUTPUT = 41;
const OP_PUSH_SLOT = 42;
const OP_PUSH_TARGET = 43;

const OP_DUP = 50;
const OP_POP = 51;
const OP_SWAP = 52;

const OP_KECCAK = 60;
const OP_CONCAT = 61;
const OP_SLICE = 62;

function uint256FromHex(hex: string) {
  // the following should be equivalent to:
  // ProofUtils.uint256FromBytes(hex)
  return hex === '0x' ? 0n : BigInt(hex.slice(0, 66));
}
function addressFromHex(hex: string) {
  // the following should be equivalent to:
  // address(uint160(ProofUtils.uint256FromBytes(hex)))
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
export function solidityArraySlots(slot: BigNumberish, length: number) {
  return length
    ? bigintRange(BigInt(solidityPackedKeccak256(['uint256'], [slot])), length)
    : [];
}
export function solidityFollowSlot(slot: BigNumberish, key: BytesLike) {
  // https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#mappings-and-dynamic-arrays
  return BigInt(keccak256(concat([key, toBeHex(slot, 32)])));
}

type ProgramAction = {
  pos: number;
  op: number;
  name: string;
  [arg: string]: any;
};

// read an ops buffer
export class ProgramReader {
  static fromProgram(program: GatewayProgram) {
    return new this(Uint8Array.from(program.ops), program.inputs.slice());
  }
  static fromEncoded(hex: HexString) {
    const [ops, inputs] = ABI_CODER.decode(['bytes', 'bytes[]'], hex);
    return new this(getBytes(ops), [...inputs]);
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
    return hexlify(this.ops.subarray(this.pos, (this.pos += n)));
  }
  readInput() {
    const i = this.readByte();
    if (i >= this.inputs.length) throw new Error(`invalid input index: ${i}`);
    return this.inputs[i];
  }
  readInputStr() {
    return toUtf8String(this.readInput());
  }
  readAction(): ProgramAction {
    const { pos } = this;
    const op = this.readByte();
    switch (op) {
      case OP_DEBUG:
        return { pos, op, name: 'DEBUG', label: this.readInputStr() };
      case OP_TARGET:
        return { pos, op, name: 'TARGET' };
      case OP_SLOT_ADD:
        return { pos, op, name: 'SLOT_ADD' };
      case OP_SLOT_ZERO:
        return { pos, op, name: 'SLOT_ZERO' };
      case OP_SET_OUTPUT:
        return { pos, op, name: 'SET_OUTPUT', index: this.readByte() };
      case OP_PUSH_INPUT:
        return { pos, op, name: 'PUSH_INPUT', index: this.readByte() };
      case OP_PUSH_OUTPUT:
        return { pos, op, name: 'PUSH_OUTPUT', index: this.readByte() };
      case OP_PUSH_SLOT:
        return { pos, op, name: 'PUSH_SLOT' };
      case OP_PUSH_TARGET:
        return { pos, op, name: 'PUSH_TARGET' };
      case OP_DUP:
        return { pos, op, name: 'DUP', back: this.readByte() };
      case OP_POP:
        return { pos, op, name: 'POP' };
      case OP_SWAP:
        return { pos, op, name: 'SWAP', back: this.readByte() };
      case OP_READ_SLOTS:
        return { pos, op, name: 'READ_SLOTS', count: this.readByte() };
      case OP_READ_BYTES:
        return { pos, op, name: 'READ_BYTES' };
      case OP_READ_HASHED:
        return { pos, op, name: 'READ_HASHED' };
      case OP_READ_ARRAY:
        return { pos, op, name: 'READ_ARRAY' };
      case OP_REQ_CONTRACT:
        return { pos, op, name: 'REQ_CONTRACT' };
      case OP_REQ_NONZERO:
        return { pos, op, name: 'REQ_NONZERO', back: this.readByte() };
      case OP_EVAL_INLINE:
        return { pos, op, name: 'EVAL_INLINE' };
      case OP_EVAL_LOOP:
        return {
          pos,
          op,
          name: 'EVAL_LOOP',
          back: this.readByte(),
          flags: this.readByte(),
        };
      case OP_SLOT_FOLLOW:
        return { pos, op, name: 'SLOT_FOLLOW' };
      case OP_KECCAK:
        return { pos, op, name: 'KECCAK' };
      case OP_CONCAT:
        return { pos, op, name: 'CONCAT' };
      case OP_SLICE:
        return {
          pos,
          op,
          name: 'SLICE',
          offset: this.readShort(),
          length: this.readShort(),
        };
      default: {
        throw new Error(`unknown op: ${op}`);
      }
    }
  }
  readActions() {
    const actions: ProgramAction[] = [];
    while (this.remaining) {
      actions.push(this.readAction());
    }
    return actions;
  }
}

export class GatewayProgram {
  constructor(
    private parent: GatewayProgram | undefined = undefined,
    readonly ops: number[] = [],
    readonly inputs: string[] = []
  ) {}
  clone() {
    return new GatewayProgram(
      this.parent,
      this.ops.slice(),
      this.inputs.slice()
    );
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
    return this.addInputBytes(toBeHex(x, 32));
  }
  addInputStr(s: string) {
    return this.addInputBytes(toUtf8Bytes(s));
  }
  addInputBytes(v: BytesLike) {
    const hex = hexlify(v);
    const i = this.inputs.length;
    this.inputs.push(hex); // note: no check, but blows up at 256
    return i;
  }
  toTuple() {
    return [Uint8Array.from(this.ops), this.inputs] as const;
  }
  encode() {
    return ABI_CODER.encode(['bytes', 'bytes[]'], this.toTuple());
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
  readHashedBytes() {
    return this.addByte(OP_READ_HASHED);
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
  eval() {
    return this.addByte(OP_EVAL_INLINE);
  }
  evalLoop(
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
    return this.addByte(OP_EVAL_LOOP)
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
  swap(back = 1) {
    return this.addByte(OP_SWAP).addByte(back);
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
  pushProgram(program: GatewayProgram) {
    return this.pushBytes(program.encode());
  }
  pushSlot() {
    return this.addByte(OP_PUSH_SLOT);
  }
  pushTarget() {
    return this.addByte(OP_PUSH_TARGET);
  }

  concat() {
    return this.addByte(OP_CONCAT);
  }
  keccak() {
    return this.addByte(OP_KECCAK);
  }
  slice(x: number, n: number) {
    return this.addByte(OP_SLICE).addShort(x).addShort(n);
  }

  // experimental syntax
  // alternative: pushProgram()
  begin() {
    return new GatewayProgram(this);
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
export class GatewayRequest extends GatewayProgram {
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
}

export type TargetNeed = { target: HexAddress; required: boolean };
export type HashedNeed = {
  hash: HexString;
  value: HexFuture;
};
export type Need = TargetNeed | bigint | HashedNeed;

// tracks the state of an program evaluation
// registers: [slot, target, stack]
// outputs are shared across eval()
// needs records sequence of necessary proofs
export class MachineState {
  static create(outputCount: number) {
    return new this(Array(outputCount).fill('0x'));
  }
  target = ZeroAddress;
  slot = 0n;
  stack: HexFuture[] = [];
  exitCode = 0;
  constructor(
    readonly outputs: HexFuture[],
    readonly needs: Need[] = [],
    readonly targets = new Map<HexString, TargetNeed>()
  ) {}
  checkOutputIndex(i: number) {
    if (i >= this.outputs.length) throw new Error(`invalid output index: ${i}`);
    return i;
  }
  checkBack(back: number) {
    if (back >= this.stack.length) throw new Error('stack underflow');
    return this.stack.length - 1 - back;
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
  changeTarget(target: HexString, max: number) {
    // IDEA: this could incrementally build the needs map
    // instead of doing it during prove()
    let need = this.targets.get(target);
    if (!need) {
      if (this.targets.size >= max) {
        throw new Error('too many targets');
      }
      // changing the target doesn't necessarily include an account proof
      // an account proof is included, either:
      // 1.) 2-level trie (stateRoot => storageRoot => slot)
      // 2.) we need to prove it is a contract (non-null codehash)
      // (native balance and other account state is not currently supported)
      need = { target, required: false };
      this.targets.set(target, need);
    }
    this.needs.push(need);
  }
}

export function isTargetNeed(need: Need) {
  return typeof need === 'object' && need && 'target' in need;
}

export function requireV1Needs(needs: Need[]) {
  if (!needs.length) {
    throw new Error('expected needs');
  }
  const need = needs[0];
  if (!isTargetNeed(need)) {
    throw new Error('first need must be account');
  }
  const slots = needs.slice(1).map((need) => {
    if (typeof need !== 'bigint') {
      throw new Error('remaining needs must be storage');
    }
    return need;
  });
  return { ...need, slots };
}

function checkReadSize(size: bigint | number, limit: number) {
  if (size > limit) {
    throw new Error(`too many bytes: ${size} > ${limit}`);
  }
  return Number(size);
}

const GATEWAY_EXT_ABI = new Interface([
  'function readBytesAt(uint256 slot) view returns (bytes)',
]);

// standard caching protocol:
// account proofs stored under 0x{HexAddress}
// storage proofs stored under 0x{HexAddress}{HexSlot w/NoZeroPad} via makeStorageKey()
export function makeStorageKey(target: HexAddress, slot: bigint) {
  return `${target}${slot.toString(16)}`;
}

export abstract class AbstractProver {
  // general proof cache
  readonly proofLRU = new LRU<string, any>(10000);
  // general async cache
  // default: deduplicates in-flight but does not cache
  readonly cache: CachedMap<string, any> = new CachedMap(0);
  // remember if contract supports readBytesAt()
  readonly readBytesAtSupported = new Map<HexAddress, boolean>();
  // maximum number of proofs (M account + N storage)
  // note: if this number is too small, protocol can be changed to uint16
  maxUniqueProofs = 128; // max = 256
  // maximum number of targets (accountProofs)
  maxUniqueTargets = 32; // max = maxUniqueProofs
  // maximum number of proofs per _getProof
  proofBatchSize = 64; // max = unlimited
  // maximum bytes from single readHashedBytes(), readFetchedBytes()
  // when readBytesAt() is not available
  maxSuppliedBytes = 13125 << 5; // max = unlimited, ~420KB @ 30m gas
  // maximum bytes from single read(), readBytes()
  maxProvableBytes = 64 << 5; // max = 32 * proof count
  // use getCode() / getStorage() if no proof is cached yet
  fast = true;

  constructor(readonly provider: Provider) {}

  checkProofCount(size: number) {
    if (size > this.maxUniqueProofs) {
      throw new Error(`too many proofs: ${size} > ${this.maxUniqueProofs}`);
    }
  }
  proofMap() {
    const map = new Map<string, bigint[]>();
    for (const key of this.proofLRU.keys()) {
      const target = key.slice(0, 42);
      let bucket = map.get(target);
      if (!bucket) {
        bucket = [];
        map.set(target, bucket);
      }
      if (key.length > 42) {
        bucket.push(BigInt('0x' + key.slice(42)));
      }
    }
    return map;
  }

  // abstract interface
  abstract isContract(target: HexAddress): Promise<boolean>;
  abstract getStorage(
    target: HexAddress,
    slot: bigint,
    fast?: boolean
  ): Promise<HexString>;
  abstract prove(needs: Need[]): Promise<ProofSequence>;
  async proveV1(needs: Need[]): Promise<ProofSequenceV1> {
    requireV1Needs(needs);
    const { proofs, order } = await this.prove(needs);
    return {
      accountProof: proofs[order[0]],
      storageProofs: Array.from(order.subarray(1), (i) => proofs[i]),
    };
  }

  // machine interface
  async evalDecoded(ops: HexString, inputs: HexString[]) {
    return this.evalReader(new ProgramReader(getBytes(ops), inputs));
  }
  async evalRequest(req: GatewayRequest) {
    return this.evalReader(ProgramReader.fromProgram(req));
  }
  async evalReader(reader: ProgramReader) {
    const vm = MachineState.create(reader.readByte());
    await this.evalCommand(reader, vm);
    return vm;
  }
  async evalCommand(reader: ProgramReader, vm: MachineState): Promise<void> {
    while (reader.remaining) {
      const op = reader.readByte();
      switch (op) {
        case OP_DEBUG: {
          // args: [string(label)] / stack: 0
          console.log(`DEBUG(${reader.readInputStr()})`, {
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
          vm.changeTarget(vm.target, this.maxUniqueTargets);
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
          vm.push(toBeHex(vm.slot, 32)); // current slot register
          continue;
        }
        case OP_PUSH_TARGET: {
          // args: [] / stack: +1
          vm.push(vm.target); // current target address
          continue;
        }
        case OP_DUP: {
          // args: [back] / stack: +1
          const back = vm.checkBack(reader.readByte());
          vm.push(vm.stack[back]);
          continue;
        }
        case OP_POP: {
          // args: [] / stack: upto(-1)
          vm.stack.pop();
          continue;
        }
        case OP_SWAP: {
          // args: [back] / stack: 0
          const back = vm.checkBack(reader.readByte());
          const last = vm.stack.length - 1;
          const temp = vm.stack[back];
          vm.stack[back] = vm.stack[last];
          vm.stack[last] = temp;
          continue;
        }
        case OP_READ_SLOTS: {
          // args: [count] / stack: +1
          const { target, slot } = vm;
          const count = reader.readByte();
          checkReadSize(count << 5, this.maxProvableBytes);
          const slots = bigintRange(slot, count);
          vm.needs.push(...slots);
          vm.push(
            slots.length
              ? new Wrapped(async () =>
                  concat(
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
          const { value, slots } = await this.getStorageBytes(target, slot);
          vm.needs.push(slot, ...slots);
          vm.push(value);
          continue;
        }
        case OP_READ_HASHED: {
          // args: [] / stack: 0 (-hash, +value)
          const hash = await unwrap(vm.pop());
          const { target, slot } = vm;
          const value = await this.getUnprovenStorageBytes(target, slot);
          vm.needs.push({ hash, value });
          vm.push(value);
          continue;
        }
        case OP_READ_ARRAY: {
          // args: [] / stack: +1
          const step = reader.readShort();
          if (!step) throw new Error('invalid element size');
          const { target, slot } = vm;
          let length = checkReadSize(
            uint256FromHex(await this.getStorage(target, slot)),
            this.maxProvableBytes
          );
          if (step < 32) {
            const per = (32 / step) | 0;
            length = ((length + per - 1) / per) | 0;
          } else {
            length = length * ((step + 31) >> 5);
          }
          const slots = solidityArraySlots(slot, length);
          slots.unshift(slot);
          vm.needs.push(...slots);
          vm.push(
            new Wrapped(async () =>
              concat(
                await Promise.all(slots.map((x) => this.getStorage(target, x)))
              )
            )
          );
          continue;
        }
        case OP_REQ_CONTRACT: {
          // args: [] / stack: 0
          const need = vm.targets.get(vm.target);
          if (need) need.required = true;
          if (!(await this.isContract(vm.target))) {
            vm.exitCode = 1;
            return;
          }
          continue;
        }
        case OP_REQ_NONZERO: {
          // args: [back] / stack: 0
          const back = vm.checkBack(reader.readByte());
          if (/^0x0*$/.test(await unwrap(vm.stack[back]))) {
            vm.exitCode = 1;
            return;
          }
          continue;
        }
        case OP_EVAL_INLINE: {
          // args: [] / stack: -1 (program) & <program logic>
          const program = ProgramReader.fromEncoded(await unwrap(vm.pop()));
          const pos = reader.pos;
          await this.evalCommand(program, vm);
          reader.pos = pos;
          if (vm.exitCode) return;
          continue;
        }
        case OP_EVAL_LOOP: {
          // args: [count, flags] / stack: -1 (program) & -count (args)
          let count = reader.readByte();
          const flags = reader.readByte();
          const program = ProgramReader.fromEncoded(await unwrap(vm.pop()));
          const vm2 = new MachineState(vm.outputs, vm.needs, vm.targets);
          for (; count && vm.stack.length; count--) {
            vm2.target = vm.target;
            vm2.slot = vm.slot;
            vm2.stack = [vm.pop()];
            vm2.exitCode = 0;
            program.pos = 0;
            await this.evalCommand(program, vm2);
            if (flags & (vm2.exitCode ? STOP_ON_FAILURE : STOP_ON_SUCCESS)) {
              break;
            }
          }
          if (flags & ACQUIRE_STATE) {
            vm.target = vm2.target;
            vm.slot = vm2.slot;
            vm.stack = vm2.stack;
          } else if (count) {
            vm.stack.splice(-count);
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
          vm.push(keccak256(await unwrap(vm.pop())));
          continue;
        }
        case OP_CONCAT: {
          // args: [] / stack: -1
          const last = vm.pop();
          const v = [vm.pop(), last];
          vm.push(
            new Wrapped(async () => concat(await Promise.all(v.map(unwrap))))
          );
          continue;
        }
        case OP_SLICE: {
          // args: [off, size] / stack: 0
          const x = reader.readShort();
          const n = reader.readShort();
          const v = await unwrap(vm.pop());
          if (x + n > (v.length - 2) >> 1) throw new Error('slice overflow');
          vm.push(dataSlice(v, x, x + n));
          continue;
        }
        default: {
          throw new Error(`unknown op: ${op}`);
        }
      }
    }
  }
  async getUnprovenStorageBytes(
    target: HexAddress,
    slot: bigint
  ): Promise<HexFuture> {
    target = target.toLowerCase();
    return new Wrapped(async () => {
      const can = this.readBytesAtSupported.get(target);
      if (can !== false) {
        try {
          const contract = new Contract(target, GATEWAY_EXT_ABI, this.provider);
          const v = await contract.readBytesAt(slot);
          if (!can) this.readBytesAtSupported.set(target, true);
          return v;
        } catch (err) {
          // TODO: only update this on CALL_EXCEPTION?
          if (!can) this.readBytesAtSupported.set(target, false);
        }
      }
      const { value } = await this.getStorageBytes(target, slot, true);
      return unwrap(value);
    });
  }
  async getStorageBytes(
    target: HexAddress,
    slot: bigint,
    fast = false
  ): Promise<{
    value: HexFuture;
    size: number;
    slots: bigint[];
  }> {
    const first = await this.getStorage(target, slot, fast);
    let size = parseInt(first.slice(64), 16); // last byte
    if ((size & 1) == 0) {
      // small
      size >>= 1;
      const value = dataSlice(first, 0, size);
      return { value, size, slots: [] };
    }
    size = checkReadSize(
      BigInt(first) >> 1n,
      fast ? this.maxSuppliedBytes : this.maxProvableBytes
    );
    if (size < 31) {
      throw new Error(`invalid storage encoding: ${target} @ ${slot}`);
    }
    const slots = solidityArraySlots(slot, (size + 31) >> 5);
    const value = new Wrapped(async () => {
      const v = await Promise.all(
        slots.map((x) => this.getStorage(target, x, fast))
      );
      return dataSlice(concat(v), 0, size);
    });
    return { value, size, slots };
  }
}

export abstract class BlockProver extends AbstractProver {
  // absolutely disgusting typescript
  static async latest<T extends InstanceType<typeof BlockProver>>(
    this: new (...a: ConstructorParameters<typeof BlockProver>) => T,
    provider: Provider,
    offset = 0
  ) {
    const blockNumber = await provider.getBlockNumber();
    return new this(provider, toString16(blockNumber - offset));
  }
  constructor(
    provider: Provider,
    readonly block: HexString
  ) {
    super(provider);
  }
  async fetchBlock() {
    return fetchBlock(this.provider, this.block);
  }
  async fetchStateRoot() {
    return (await this.fetchBlock()).stateRoot;
  }
  protected abstract _proveNeed(
    need: TargetNeed,
    accountRef: ProofRef,
    storageRefs: Map<bigint, ProofRef>
  ): Promise<void>;
  override async prove(needs: Need[]) {
    // reduce an ordered list of needs into a deduplicated list of proofs
    // provide empty proofs for non-contract slots
    type Bucket = {
      need: TargetNeed;
      ref: ProofRef;
      map: Map<bigint, ProofRef>;
    };
    const promises: Promise<any>[] = [];
    const named = new Map<HexString, ProofRef>();
    const buckets = new Map<HexString, Bucket>();
    const refs: ProofRef[] = [];
    let nullRef: ProofRef | undefined;
    const createRef = () => {
      const ref = { id: refs.length, proof: '0x' };
      refs.push(ref);
      return ref;
    };
    let bucket: Bucket | undefined;
    const order = needs.map((need) => {
      if (isTargetNeed(need)) {
        // accountProof
        // we must prove this value since it leads to a stateRoot
        bucket = buckets.get(need.target);
        if (!bucket) {
          bucket = {
            need,
            ref: createRef(),
            map: new Map(),
          };
          buckets.set(need.target, bucket);
        }
        return bucket.ref;
      } else if (typeof need === 'bigint') {
        // storageProof (for targeted account)
        // bucket can be undefined if a slot is read without a target
        // this is okay because the initial machine state is NOT_A_CONTRACT
        if (!bucket) return (nullRef ??= createRef());
        let ref = bucket.map.get(need);
        if (!ref) {
          ref = createRef();
          bucket.map.set(need, ref);
        }
        return ref;
      } else {
        // currently, this is just HashedNeed
        let ref = named.get(need.hash);
        if (!ref) {
          ref = createRef();
          promises.push((async () => (ref.proof = await unwrap(need.value)))());
          named.set(need.hash, ref);
        }
        return ref;
      }
    });
    this.checkProofCount(refs.length);
    for (const bucket of buckets.values()) {
      promises.push(this._proveNeed(bucket.need, bucket.ref, bucket.map));
    }
    await Promise.all(promises);
    return {
      proofs: refs.map((x) => x.proof),
      order: Uint8Array.from(order, (x) => x.id),
    };
  }
}
