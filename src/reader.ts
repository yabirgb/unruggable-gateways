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
    const actions: ProgramAction[] = [];
    if (program instanceof GatewayRequest) {
      actions.push({
        pos: 0,
        op: reader.readByte(), // outputCount,
        name: 'OUTPUT_COUNT',
      });
    }
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
  pos = 0;
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
  inputAt(i: number) {
    if (i >= this.inputs.length) throw new Error(`invalid input index: ${i}`);
    return this.inputs[i];
  }
  readByte() {
    this.checkRead(1);
    return this.ops[this.pos++];
  }
  readBytes(n: number) {
    this.checkRead(n);
    return hexlify(this.ops.subarray(this.pos, (this.pos += n)));
  }
  readSmallBytes() {
    return this.readBytes(this.readByte());
  }
  readSmallStr() {
    return toUtf8String(this.readBytes(this.readByte()));
  }
  private parseArgs(op: number) {
    // TODO: this is probably incomplete
    switch (op) {
      case OP.DEBUG:
        return { label: this.readSmallStr() };
      case OP.PUSH_VALUE:
      case OP.PUSH_BYTES:
        return { bytes: this.readSmallBytes() };
      case OP.EVAL_LOOP:
        return { flags: this.readByte() };
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
