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
  dataSlice,
  concat,
  getBytes,
  toUtf8Bytes,
} from 'ethers/utils';
import { unwrap, Wrapped, type Unwrappable } from './wrap.js';
import { ABI_CODER, fetchBlock, toUnpaddedHex, toPaddedHex } from './utils.js';
import { CachedMap, LRU } from './cached.js';
import { GATEWAY_OP as OP } from './ops.js';
import { ProgramReader } from './reader.js';

// all addresses are lowercase
// all values are hex-strings

type HexFuture = Unwrappable<HexString>;

// maximum number of items on stack
// the following should not be larger than MAX_STACK in GatewayProtocol.sol
export const MAX_STACK = 64;

// EVAL_LOOP flags
// the following should be equivalent to GatewayProtocol.sol
const STOP_ON_SUCCESS = 1;
const STOP_ON_FAILURE = 2;
const ACQUIRE_STATE = 4;

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
  return BigInt(keccak256(concat([key, toPaddedHex(slot)])));
}

export class GatewayProgram {
  constructor(
    readonly ops: number[] = [],
    readonly inputs: string[] = []
  ) {}
  clone() {
    return new GatewayProgram(this.ops.slice(), this.inputs.slice());
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
  addInput(x: BigNumberish | boolean) {
    return this.addInputBytes(toPaddedHex(x));
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
    return this.addByte(OP.DEBUG).addByte(this.addInputStr(label));
  }

  read(n = 1) {
    return this.addByte(OP.READ_SLOTS).addByte(n);
  }
  readBytes() {
    return this.addByte(OP.READ_BYTES);
  }
  readHashedBytes() {
    return this.addByte(OP.READ_HASHED);
  }
  readArray(step: number) {
    return this.addByte(OP.READ_ARRAY).addShort(step);
  }

  target() {
    return this.addByte(OP.TARGET);
  }
  setOutput(i: number) {
    return this.addByte(OP.SET_OUTPUT).addByte(i);
  }
  eval() {
    return this.addByte(OP.EVAL_INLINE);
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
    // TODO: add recursion limit
    // TODO: add can modify output
    return this.addByte(OP.EVAL_LOOP)
      .addByte(opts.back ?? 255)
      .addByte(flags);
  }

  // zeroSlot() {
  //   //return this.addByte(OP.SLOT_ZERO); // old
  //   return this.push(0).slot(); // new
  // }
  addSlot() {
    return this.addByte(OP.SLOT_ADD);
    // same as: this.pushSlot().add().slot();
  }
  slot() {
    return this.addByte(OP.SLOT);
  }
  follow() {
    return this.addByte(OP.SLOT_FOLLOW);
    // same as: this.pushSlot().concat().keccak().slot();
  }
  followIndex() {
    return this.pushSlot().keccak().slot().addSlot();
  }

  requireContract() {
    return this.addByte(OP.REQ_CONTRACT);
  }
  requireNonzero(back = 0) {
    return this.addByte(OP.REQ_NONZERO).addByte(back);
  }

  pop() {
    return this.addByte(OP.POP);
  }
  dup(back = 0) {
    return this.addByte(OP.DUP).addByte(back);
  }
  swap(back = 1) {
    return this.addByte(OP.SWAP).addByte(back);
  }

  pushOutput(i: number) {
    return this.addByte(OP.PUSH_OUTPUT).addByte(i);
  }
  pushInput(i: number) {
    return this.addByte(OP.PUSH_INPUT).addByte(i);
  }
  push(x: BigNumberish | boolean) {
    x = BigInt(x);
    if (x >= 0 && x < 256) {
      return this.addByte(OP.PUSH_BYTE).addByte(Number(x));
    } else {
      return this.addByte(OP.PUSH_INPUT).addByte(this.addInput(x));
    }
  }
  pushStr(s: string) {
    return this.addByte(OP.PUSH_INPUT).addByte(this.addInputStr(s));
  }
  pushBytes(v: BytesLike) {
    return this.addByte(OP.PUSH_INPUT).addByte(this.addInputBytes(v));
  }
  pushProgram(program: GatewayProgram) {
    return this.pushBytes(program.encode());
  }
  pushSlot() {
    return this.addByte(OP.PUSH_SLOT);
  }
  pushTarget() {
    return this.addByte(OP.PUSH_TARGET);
  }

  concat() {
    return this.addByte(OP.CONCAT);
  }
  keccak() {
    return this.addByte(OP.KECCAK);
  }
  slice(x: number, n: number) {
    return this.addByte(OP.SLICE).addShort(x).addShort(n);
  }
  plus() {
    return this.addByte(OP.PLUS);
  }
  times() {
    return this.addByte(OP.TIMES);
  }
  divide() {
    return this.addByte(OP.DIVIDE);
  }
  and() {
    return this.addByte(OP.AND);
  }
  or() {
    return this.addByte(OP.OR);
  }
  not() {
    return this.addByte(OP.NOT);
  }
  shl(shift: number) {
    return this.addByte(OP.SHIFT_LEFT).addByte(shift);
  }
  shr(shift: number) {
    return this.addByte(OP.SHIFT_RIGHT).addByte(shift);
  }

  // shorthands?
  offset(x: BigNumberish) {
    return this.push(x).addSlot();
  }
  setTarget(x: HexString) {
    return this.push(x).target();
  }
  setSlot(x: BigNumberish) {
    return this.push(x).slot();
  }
}

// a request is just a command where the leading byte is the number of outputs
export class GatewayRequest extends GatewayProgram {
  context: HexString | undefined;
  constructor(outputCount = 0) {
    super();
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
  hash: HexFuture;
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
  popSlice(n: number) {
    if (this.stack.length < n) throw new Error('stack underflow');
    return this.stack.splice(this.stack.length - n, n);
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
  binaryOp(fn: (a: bigint, b: bigint) => bigint) {
    const v = this.popSlice(2);
    this.push(
      new Wrapped(async () => {
        const [a, b] = await Promise.all(v.map(unwrap));
        return toPaddedHex(fn(uint256FromHex(a), uint256FromHex(b)));
      })
    );
  }
  unaryOp(fn: (x: bigint) => bigint) {
    const x = this.pop();
    this.push(
      new Wrapped(async () => {
        return toPaddedHex(fn(uint256FromHex(await unwrap(x))));
      })
    );
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
  async evalDecoded(ops: BytesLike, inputs: HexString[]) {
    return this.evalReader(new ProgramReader(getBytes(ops), inputs));
  }
  async evalRequest(req: GatewayRequest) {
    return this.evalReader(ProgramReader.fromProgram(req));
  }
  async evalReader(reader: ProgramReader) {
    const vm = MachineState.create(reader.readByte());
    await this.eval(reader, vm);
    return vm;
  }
  private async eval(reader: ProgramReader, vm: MachineState): Promise<void> {
    while (reader.remaining) {
      const op = reader.readByte();
      switch (op) {
        case OP.TARGET: {
          // args: [] / stack: -1
          vm.target = addressFromHex(await unwrap(vm.pop()));
          vm.slot = 0n;
          vm.changeTarget(vm.target, this.maxUniqueTargets);
          continue;
        }
        case OP.SLOT_FOLLOW: {
          // args: [] / stack: -1
          vm.slot = solidityFollowSlot(vm.slot, await unwrap(vm.pop()));
          continue;
        }
        case OP.SLOT: {
          // args: [] / stack: -1
          vm.slot = uint256FromHex(await unwrap(vm.pop()));
          continue;
        }
        case OP.SLOT_ADD: {
          // args: [] / stack: -1
          vm.slot += uint256FromHex(await unwrap(vm.pop()));
          continue;
        }
        case OP.SLOT_ZERO: {
          // args: [] / stack: 0 / *** DEPRECATED ***
          vm.slot = 0n;
          continue;
        }
        case OP.SET_OUTPUT: {
          // args: [outputIndex] / stack: -1
          vm.outputs[vm.checkOutputIndex(reader.readByte())] = vm.pop();
          continue;
        }
        case OP.PUSH_INPUT: {
          // args: [inputIndex] / stack: 0
          vm.push(reader.readInput());
          continue;
        }
        case OP.PUSH_OUTPUT: {
          // args: [outputIndex] / stack: +1
          vm.push(vm.outputs[vm.checkOutputIndex(reader.readByte())]);
          continue;
        }
        case OP.PUSH_BYTE: {
          // args: [byte] / stack: +1
          vm.push(toPaddedHex(reader.readByte()));
          continue;
        }
        case OP.PUSH_SLOT: {
          // args: [] / stack: +1
          vm.push(toPaddedHex(vm.slot)); // current slot register
          continue;
        }
        case OP.PUSH_TARGET: {
          // args: [] / stack: +1
          vm.push(vm.target); // current target address
          continue;
        }
        case OP.DUP: {
          // args: [back] / stack: +1
          const back = vm.checkBack(reader.readByte());
          vm.push(vm.stack[back]);
          continue;
        }
        case OP.POP: {
          // args: [] / stack: upto(-1)
          vm.stack.pop();
          continue;
        }
        case OP.SWAP: {
          // args: [back] / stack: 0
          const back = vm.checkBack(reader.readByte());
          const last = vm.stack.length - 1;
          const temp = vm.stack[back];
          vm.stack[back] = vm.stack[last];
          vm.stack[last] = temp;
          continue;
        }
        case OP.READ_SLOTS: {
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
        case OP.READ_BYTES: {
          // args: [] / stack: +1
          // https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#bytes-and-string
          const { target, slot } = vm;
          const { value, slots } = await this.getStorageBytes(target, slot);
          vm.needs.push(slot, ...slots);
          vm.push(value);
          continue;
        }
        case OP.READ_HASHED: {
          // args: [] / stack: 0 (-hash, +value)
          const { target, slot } = vm;
          const hash = vm.pop(); // we can technically ignore this value
          const value = this.fetchUnprovenStorageBytes(target, slot);
          vm.needs.push({ hash, value });
          vm.push(value);
          continue;
        }
        case OP.READ_ARRAY: {
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
        case OP.REQ_CONTRACT: {
          // args: [] / stack: 0
          const need = vm.targets.get(vm.target);
          if (need) need.required = true;
          if (!(await this.isContract(vm.target))) {
            vm.exitCode = 1;
            return;
          }
          continue;
        }
        case OP.REQ_NONZERO: {
          // args: [back] / stack: 0
          const back = vm.checkBack(reader.readByte());
          if (/^0x0*$/.test(await unwrap(vm.stack[back]))) {
            vm.exitCode = 1;
            return;
          }
          continue;
        }
        case OP.EVAL_INLINE: {
          // args: [] / stack: -1 (program) & <program logic>
          const program = ProgramReader.fromEncoded(await unwrap(vm.pop()));
          const pos = reader.pos;
          await this.eval(program, vm);
          reader.pos = pos;
          if (vm.exitCode) return;
          continue;
        }
        case OP.EVAL_LOOP: {
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
            await this.eval(program, vm2);
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
        case OP.KECCAK: {
          // args: [] / stack: 0
          vm.push(keccak256(await unwrap(vm.pop())));
          continue;
        }
        case OP.CONCAT: {
          // args: [] / stack: -1
          const v = vm.popSlice(2);
          vm.push(
            new Wrapped(async () => concat(await Promise.all(v.map(unwrap))))
          );
          continue;
        }
        case OP.SLICE: {
          // args: [off, size] / stack: 0
          const x = reader.readShort();
          const n = reader.readShort();
          const v = await unwrap(vm.pop());
          if (x + n > (v.length - 2) >> 1) throw new Error('slice overflow');
          vm.push(dataSlice(v, x, x + n));
          continue;
        }
        // all binary ops:
        // args: [] / stack: -1 (f(a, b) => c)
        case OP.PLUS: {
          vm.binaryOp((a, b) => a + b);
          continue;
        }
        case OP.TIMES: {
          vm.binaryOp((a, b) => a * b);
          continue;
        }
        case OP.DIVIDE: {
          vm.binaryOp((a, b) => a / b);
          continue;
        }
        case OP.AND: {
          vm.binaryOp((a, b) => a & b);
          continue;
        }
        case OP.OR: {
          vm.binaryOp((a, b) => a | b);
          continue;
        }
        case OP.NOT: {
          // args: [] / stack: 0
          vm.unaryOp((x) => ~x);
          continue;
        }
        case OP.SHIFT_LEFT: {
          // args: [shift] / stack: 0
          const shift = reader.readByte();
          vm.unaryOp((x) => x << BigInt(shift));
          continue;
        }
        case OP.SHIFT_RIGHT: {
          // args: [shift] / stack: 0
          const shift = reader.readByte();
          vm.unaryOp((x) => x >> BigInt(shift));
          continue;
        }
        case OP.DEBUG: {
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
        default: {
          throw new Error(`unknown op: ${op}`);
        }
      }
    }
  }
  fetchUnprovenStorageBytes(target: HexAddress, slot: bigint): HexFuture {
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
    fast?: boolean
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
    offset = 0 // experimental
  ) {
    const blockNumber = await provider.getBlockNumber();
    return new this(provider, toUnpaddedHex(blockNumber - offset));
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
        // TODO: check the hash?
        const ref = createRef();
        promises.push((async () => (ref.proof = await unwrap(need.value)))());
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
