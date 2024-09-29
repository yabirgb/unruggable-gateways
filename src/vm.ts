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
import { ZeroAddress, ZeroHash, MaxUint256 } from 'ethers/constants';
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

// EVAL_LOOP flags
// the following should be equivalent to GatewayProtocol.sol
const STOP_ON_SUCCESS = 1;
const STOP_ON_FAILURE = 2;
const ACQUIRE_STATE = 4;

const EXIT = {
  SUCCESS: 0, // do we need this?
  NOT_A_CONTRACT: 254,
  NOT_NONZERO: 253,
};

function isZeros(hex: HexString) {
  return /^0x0*$/.test(hex);
}
function uint256FromHex(hex: string) {
  // the following should be equivalent to:
  // ProofUtils.uint256FromBytes(hex)
  return hex === '0x' ? 0n : BigInt(hex.slice(0, 66));
}
function numberFromHex(hex: string) {
  const u = uint256FromHex(hex);
  if (u > 0xffffff) throw new Error('numeric overflow');
  return Number(u);
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
  static readonly Opcode = OP;
  static readonly Exitcode = EXIT;
  constructor(
    readonly ops: number[] = [],
    readonly inputs: string[] = []
  ) {}
  clone() {
    return new GatewayProgram(this.ops.slice(), this.inputs.slice());
  }
  op(key: keyof typeof OP) {
    return this.addByte(OP[key]);
  }
  protected addByte(x: number) {
    if ((x & 0xff) !== x) throw new Error(`expected byte: ${x}`);
    this.ops.push(x);
    return this;
  }
  protected appendSmallBytes(v: BytesLike) {
    const u = getBytes(v);
    this.addByte(u.length);
    this.ops.push(...u);
    return this;
  }
  defineInput(x: BigNumberish | boolean) {
    return this.defineInputBytes(toPaddedHex(x));
  }
  defineInputStr(s: string) {
    return this.defineInputBytes(toUtf8Bytes(s));
  }
  defineInputBytes(v: BytesLike) {
    const hex = hexlify(v);
    const i = this.inputs.length;
    this.inputs.push(hex);
    return i;
  }
  toTuple() {
    return [Uint8Array.from(this.ops), this.inputs] as const;
  }
  encode() {
    return ABI_CODER.encode(['bytes', 'bytes[]'], this.toTuple());
  }
  debug(label = '') {
    return this.addByte(OP.DEBUG).appendSmallBytes(toUtf8Bytes(label));
  }

  read(n = 1) {
    return n == 1
      ? this.addByte(OP.READ_SLOT)
      : this.push(n).addByte(OP.READ_SLOTS);
  }
  readBytes() {
    return this.addByte(OP.READ_BYTES);
  }
  readHashedBytes() {
    return this.addByte(OP.READ_HASHED);
  }
  readArray(step: number) {
    return this.push(step).addByte(OP.READ_ARRAY);
  }

  setTarget(x: HexString) {
    return this.push(x).target();
  }
  target() {
    return this.addByte(OP.TARGET);
  }

  setOutput(i: number) {
    return this.push(i).addByte(OP.SET_OUTPUT);
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
    return this.push(opts.back ?? 255) // this should be >= MAX_STACK
      .addByte(OP.EVAL_LOOP)
      .addByte(flags);
  }

  setSlot(x: BigNumberish) {
    return this.push(x).slot();
  }
  offset(x: BigNumberish) {
    return this.push(x).addSlot();
  }
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
  requireNonzero() {
    return this.addByte(OP.REQ_NONZERO);
  }

  pop() {
    return this.addByte(OP.POP);
  }
  dup(back = 0) {
    return this.push(back).addByte(OP.DUP);
  }
  swap(back = 1) {
    return this.push(back).addByte(OP.SWAP);
  }

  pushOutput(i: number) {
    return this.push(i).addByte(OP.PUSH_OUTPUT);
  }
  pushInput(i: number) {
    return this.push(i).addByte(OP.PUSH_INPUT);
  }
  push(x: BigNumberish | boolean) {
    const i = BigInt.asUintN(256, BigInt(x));
    if (!i) return this.addByte(OP.PUSH_0);
    const hex = i.toString(16);
    const prefix = hex.length & 1 ? '0x0' : '0x';
    return this.addByte(OP.PUSH_VALUE).appendSmallBytes(prefix + hex);
  }
  pushStr(s: string) {
    return this.pushBytes(toUtf8Bytes(s));
  }
  pushBytes(v: BytesLike) {
    const u = getBytes(v);
    return u.length < 256
      ? this.addByte(OP.PUSH_BYTES).appendSmallBytes(u)
      : this.pushInput(this.defineInputBytes(u));
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
    return this.push(x).push(n).addByte(OP.SLICE);
  }

  plus() {
    return this.addByte(OP.PLUS);
  }
  subtract() {
    return this.push(MaxUint256).plus().not().plus(); // TODO: add op?
  }
  times() {
    return this.addByte(OP.TIMES);
  }
  divide() {
    return this.addByte(OP.DIVIDE);
  }
  mod() {
    return this.addByte(OP.MOD);
  }
  and() {
    return this.addByte(OP.AND);
  }
  or() {
    return this.addByte(OP.OR);
  }
  xor() {
    return this.addByte(OP.XOR);
  }
  isNonzero() {
    return this.addByte(OP.NONZERO);
  }
  not() {
    return this.addByte(OP.NOT);
  }
  shl(shift: number | bigint) {
    return this.push(shift).addByte(OP.SHIFT_LEFT);
  }
  shr(shift: number | bigint) {
    return this.push(shift).addByte(OP.SHIFT_RIGHT);
  }
  eq() {
    return this.addByte(OP.EQ);
  }
  lt() {
    return this.addByte(OP.LT);
  }
  gt() {
    return this.addByte(OP.GT);
  }
  flip() {
    return this.push(0).eq();
  }
  neq() {
    return this.eq().flip();
  }
  lte() {
    return this.gt().flip();
  }
  gte() {
    return this.lt().flip();
  }
}

// a request is just a command where the leading byte is the number of outputs
export class GatewayRequest extends GatewayProgram {
  constructor(outputCount = 0) {
    super();
    this.addByte(outputCount);
  }
  override clone() {
    const temp = new GatewayRequest();
    temp.ops.length = 0;
    temp.ops.push(...this.ops);
    temp.inputs.push(...this.inputs);
    return temp;
  }
  get outputCount() {
    return this.ops[0];
  }
  // the following functionality is not available in solidity!
  private ensureCapacity(n: number) {
    if (n < this.outputCount) throw new Error('invalid capacity');
    if (n > 0xff) throw new Error('output overflow');
    this.ops[0] = n;
  }
  // convenience for writing requests
  addOutput() {
    const i = this.outputCount;
    this.ensureCapacity(i + 1);
    return this.setOutput(i);
  }
  // convenience for draining stack into outputs
  drain(count: number) {
    const offset = this.outputCount;
    this.ensureCapacity(offset + count);
    while (count > 0) this.setOutput(offset + --count);
    return this;
  }
}

export type TargetNeed = { target: HexAddress; required: boolean };
export type HashedNeed = {
  hash: HexFuture;
  value: HexFuture;
};
export type Need = TargetNeed | bigint | HashedNeed;

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

// data sturcutre that records the state of an evaluation
// registers: [slot, target, stack]
// outputs are shared across eval()
// needs records sequence of necessary proofs
export class MachineState {
  static create(outputCount: number, maxStackSize = Infinity) {
    return new this(Array(outputCount).fill('0x'), maxStackSize);
  }
  target = ZeroAddress;
  slot = 0n;
  stack: HexFuture[] = [];
  exitCode = 0;
  constructor(
    readonly outputs: HexFuture[],
    readonly maxStack: number,
    readonly needs: Need[] = [],
    readonly targets = new Map<HexString, TargetNeed>()
  ) {}
  checkOutputIndex(i: number) {
    if (i >= this.outputs.length) throw new Error(`invalid output index: ${i}`);
    return i;
  }
  checkBack(back: number) {
    if (back >= this.stack.length) throw new Error('back overflow');
    return this.stack.length - 1 - back;
  }
  resolveOutputs() {
    return Promise.all(this.outputs.map(unwrap));
  }
  resolveStack() {
    return Promise.all(this.stack.map(unwrap));
  }
  push(value: HexFuture) {
    if (this.stack.length >= this.maxStack) throw new Error('stack overflow');
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
  async popNumber() {
    return numberFromHex(await unwrap(this.pop()));
  }
  async binaryOp(fn: (a: bigint, b: bigint) => bigint | boolean) {
    const [a, b] = await Promise.all(this.popSlice(2).map(unwrap));
    this.push(toPaddedHex(fn(uint256FromHex(a), uint256FromHex(b))));
    // const v = this.popSlice(2);
    // if (typeof v[0] === 'string' && typeof v[1] === 'string') {
    //   this.push(toPaddedHex(fn(uint256FromHex(v[0]), uint256FromHex(v[1]))));
    // } else {
    //   this.push(
    //     new Wrapped(async () => {
    //       const [a, b] = await Promise.all(v.map(unwrap));
    //       return toPaddedHex(fn(uint256FromHex(a), uint256FromHex(b)));
    //     })
    //   );
    // }
  }
}

function checkSize(size: bigint | number, limit: number) {
  if (size > limit) throw new Error(`too many bytes: ${size} > ${limit}`);
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
  // maximum number of items on stack
  // should not be larger than MAX_STACK in GatewayProtocol.sol
  maxStackSize = 64; // max = unlimited
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
  // maximum bytes from concat(), slice()
  maxAssembleBytes = 1 << 20; // max = server memory
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
    const vm = MachineState.create(reader.readByte(), this.maxStackSize);
    await this.eval(reader, vm);
    return vm;
  }
  private async eval(reader: ProgramReader, vm: MachineState): Promise<void> {
    while (reader.remaining) {
      const op = reader.readByte();
      switch (op) {
        case OP.TARGET: {
          const target = addressFromHex(await unwrap(vm.pop()));
          // IDEA: this could incrementally build the needs map
          // instead of doing it during prove()
          let need = vm.targets.get(target);
          if (!need) {
            if (vm.targets.size >= this.maxUniqueTargets) {
              throw new Error('too many targets');
            }
            // changing the target doesn't necessarily include an account proof
            // an account proof is included, either:
            // 1.) 2-level trie (stateRoot => storageRoot => slot)
            // 2.) we need to prove it is a contract (non-null codehash)
            // (native balance and other account state is not currently supported)
            need = { target, required: false };
            vm.targets.set(target, need);
          }
          vm.needs.push(need);
          vm.target = target;
          vm.slot = 0n;
          continue;
        }
        case OP.SLOT_FOLLOW: {
          vm.slot = solidityFollowSlot(vm.slot, await unwrap(vm.pop()));
          continue;
        }
        case OP.SLOT: {
          vm.slot = uint256FromHex(await unwrap(vm.pop()));
          continue;
        }
        case OP.SLOT_ADD: {
          vm.slot += uint256FromHex(await unwrap(vm.pop()));
          continue;
        }
        case OP.SET_OUTPUT: {
          vm.outputs[vm.checkOutputIndex(await vm.popNumber())] = vm.pop();
          continue;
        }
        case OP.PUSH_INPUT: {
          vm.push(reader.inputAt(await vm.popNumber()));
          continue;
        }
        case OP.PUSH_OUTPUT: {
          vm.push(vm.outputs[vm.checkOutputIndex(await vm.popNumber())]);
          continue;
        }
        case OP.PUSH_VALUE: {
          vm.push(toPaddedHex(reader.readSmallBytes()));
          continue;
        }
        case OP.PUSH_BYTES: {
          vm.push(reader.readSmallBytes());
          continue;
        }
        case OP.PUSH_SLOT: {
          vm.push(toPaddedHex(vm.slot)); // current slot register
          continue;
        }
        case OP.PUSH_TARGET: {
          vm.push(vm.target); // current target address
          continue;
        }
        case OP.PUSH_0: {
          vm.push(ZeroHash);
          continue;
        }
        case OP.DUP: {
          vm.push(vm.stack[vm.checkBack(await vm.popNumber())]);
          continue;
        }
        case OP.POP: {
          vm.stack.pop();
          continue;
        }
        case OP.SWAP: {
          const back = vm.checkBack(await vm.popNumber());
          const last = vm.stack.length - 1;
          const temp = vm.stack[back];
          vm.stack[back] = vm.stack[last];
          vm.stack[last] = temp;
          continue;
        }
        case OP.READ_SLOT: {
          const { target, slot } = vm;
          vm.needs.push(slot);
          vm.push(new Wrapped(() => this.getStorage(target, slot)));
          continue;
        }
        case OP.READ_SLOTS: {
          const { target, slot } = vm;
          const count = await vm.popNumber();
          checkSize(count << 5, this.maxProvableBytes);
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
          // https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#bytes-and-string
          const { target, slot } = vm;
          const { value, slots } = await this.getStorageBytes(target, slot);
          vm.needs.push(slot, ...slots);
          vm.push(value);
          continue;
        }
        case OP.READ_HASHED: {
          const { target, slot } = vm;
          const hash = vm.pop(); // we can technically ignore this value
          const value = this.fetchUnprovenStorageBytes(target, slot);
          vm.needs.push({ hash, value });
          vm.push(value);
          continue;
        }
        case OP.READ_ARRAY: {
          const step = await vm.popNumber();
          if (!step) throw new Error('invalid element size');
          const { target, slot } = vm;
          let length = checkSize(
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
          const need = vm.targets.get(vm.target);
          if (need) need.required = true;
          if (!(await this.isContract(vm.target))) {
            vm.exitCode = EXIT.NOT_A_CONTRACT;
            return;
          }
          continue;
        }
        case OP.REQ_NONZERO: {
          if (isZeros(await unwrap(vm.stack[vm.checkBack(0)]))) {
            vm.exitCode = EXIT.NOT_NONZERO;
            return;
          }
          continue;
        }
        case OP.EVAL_INLINE: {
          const program = ProgramReader.fromEncoded(await unwrap(vm.pop()));
          await this.eval(program, vm);
          if (vm.exitCode) return;
          continue;
        }
        case OP.EVAL_LOOP: {
          // [program, count] + flags => any[]
          const flags = reader.readByte();
          const [code, n] = await Promise.all(vm.popSlice(2).map(unwrap));
          const program = ProgramReader.fromEncoded(code);
          const vm2 = new MachineState(
            vm.outputs,
            vm.maxStack,
            vm.needs,
            vm.targets
          );
          let count = numberFromHex(n);
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
          vm.push(keccak256(await unwrap(vm.pop())));
          // const value = vm.pop();
          // vm.push(new Wrapped(async () => keccak256(await unwrap(value))));
          continue;
        }
        case OP.CONCAT: {
          const v = concat(await Promise.all(vm.popSlice(2).map(unwrap)));
          checkSize((v.length - 2) >> 1, this.maxAssembleBytes);
          vm.push(v);
          // const v = vm.popSlice(2);
          // vm.push(
          //   new Wrapped(async () => concat(await Promise.all(v.map(unwrap))))
          // );
          continue;
        }
        case OP.SLICE: {
          const [v, x, n] = await Promise.all(vm.popSlice(3).map(unwrap));
          const pos = numberFromHex(x);
          const size = checkSize(numberFromHex(n), this.maxAssembleBytes);
          const len = (v.length - 2) >> 1;
          const end = pos + size;
          if (len >= end) {
            vm.push(dataSlice(v, pos, end));
          } else {
            const prefix = pos >= len ? '0x' : dataSlice(v, pos, len);
            vm.push(prefix.padEnd((size + 1) << 1, '0'));
          }
          // const [pos, size] = await Promise.all(
          //   vm.popSlice(2).map(async (x) => numberFromHex(await unwrap(x)))
          // );
          // const value = vm.pop();
          // vm.push(
          //   size
          //     ? new Wrapped(async () => {
          //         const v = await unwrap(value);
          //         const len = (v.length - 2) >> 1;
          //         const end = pos + size;
          //         if (len >= end) return dataSlice(v, pos, end);
          //         const prefix = pos >= len ? '0x' : dataSlice(v, pos, len);
          //         return prefix.padEnd((size + 1) << 1, '0');
          //       })
          //     : '0x'
          // );
          continue;
        }
        case OP.PLUS: {
          await vm.binaryOp((a, b) => a + b);
          continue;
        }
        // case OP.SUBTRACT: {
        //   await vm.binaryOp((a, b) => a - b);
        //   continue;
        // }
        case OP.TIMES: {
          await vm.binaryOp((a, b) => a * b);
          continue;
        }
        case OP.DIVIDE: {
          await vm.binaryOp((a, b) => a / b);
          continue;
        }
        case OP.MOD: {
          await vm.binaryOp((a, b) => a % b);
          continue;
        }
        case OP.AND: {
          await vm.binaryOp((a, b) => a & b);
          continue;
        }
        case OP.OR: {
          await vm.binaryOp((a, b) => a | b);
          continue;
        }
        case OP.XOR: {
          await vm.binaryOp((a, b) => a ^ b);
          continue;
        }
        case OP.SHIFT_LEFT: {
          await vm.binaryOp((x, shift) => x << shift);
          continue;
        }
        case OP.SHIFT_RIGHT: {
          await vm.binaryOp((x, shift) => x >> shift);
          continue;
        }
        case OP.EQ: {
          await vm.binaryOp((a, b) => a == b);
          continue;
        }
        case OP.LT: {
          await vm.binaryOp((a, b) => a < b);
          continue;
        }
        case OP.GT: {
          await vm.binaryOp((a, b) => a > b);
          continue;
        }
        case OP.NONZERO: {
          vm.push(toPaddedHex(!isZeros(await unwrap(vm.pop()))));
          continue;
        }
        case OP.NOT: {
          vm.push(toPaddedHex(~uint256FromHex(await unwrap(vm.pop()))));
          continue;
        }
        case OP.DEBUG: {
          console.log(`DEBUG(${reader.readSmallStr()})`, {
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
    slots: bigint[]; // note: does not include header slot!
  }> {
    const first = await this.getStorage(target, slot, fast);
    let size = parseInt(first.slice(64), 16); // last byte
    if ((size & 1) == 0) {
      // small
      size >>= 1;
      const value = dataSlice(first, 0, size); // will throw if size is invalid
      return { value, size, slots: [] };
    }
    size = checkSize(
      BigInt(first) >> 1n,
      fast ? this.maxSuppliedBytes : this.maxProvableBytes
    );
    if (size < 32) {
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
    provider: Provider
  ) {
    return new this(provider, await provider.getBlockNumber());
  }
  readonly block: HexString;
  constructor(provider: Provider, block: BigNumberish) {
    super(provider);
    this.block = toUnpaddedHex(block);
  }
  fetchBlock() {
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
