import type { HexString } from './types.js';
import { getBytes, hexlify, toUtf8String } from 'ethers/utils';
import { ABI_CODER } from './utils.js';
import { GatewayProgram, GatewayRequest } from './vm.js';
import { GATEWAY_OP as OP } from './ops.js';

const NAMES: string[] = [];
Object.entries(OP).forEach(([name, op]) => (NAMES[op] = name));

type ProgramAction = {
  pos: number;
  op: number;
  name: string;
} & Record<string, any>;

export class ProgramReader {
  static actions(program: GatewayProgram) {
    const reader = this.fromProgram(program);
    if (program instanceof GatewayRequest) {
      reader.readByte(); // skip outputCount
    }
    const actions: ProgramAction[] = [];
    while (reader.remaining) {
      actions.push(reader.readAction());
    }
    return actions;
  }
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
  private parseArgs(op: number) {
    // TODO: this is probably incomplete
    switch (op) {
      case OP.DEBUG:
        return { label: this.readInputStr() };
      case OP.PUSH_BYTE:
      case OP.SET_OUTPUT:
      case OP.PUSH_INPUT:
      case OP.PUSH_OUTPUT:
        return { index: this.readByte() };
      case OP.READ_SLOTS:
        return { count: this.readByte() };
      case OP.DUP:
      case OP.SWAP:
      case OP.REQ_NONZERO:
        return { back: this.readByte() };
      case OP.SHIFT_LEFT:
      case OP.SHIFT_RIGHT:
        return { shift: this.readByte() };
      case OP.EVAL_LOOP:
        return { back: this.readByte(), flags: this.readByte() };
      case OP.SLICE:
        return { offset: this.readShort(), length: this.readShort() };
      default:
        return {};
    }
  }
  readAction(): ProgramAction {
    const op = this.readByte();
    const name = NAMES[op];
    if (!name) throw new Error(`unknown op: ${op}`);
    return { pos: this.pos, op, name, ...this.parseArgs(op) };
  }
}
