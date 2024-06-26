import type {HexString, BigNumberish, BytesLike} from './types.js';
import {ethers} from 'ethers';
import {EVMRequest} from './vm.js';

// export const GATEWAY_ABI = new ethers.Interface([
// 	`function getStorageSlots(address addr, bytes32[] commands, bytes[] constants) returns (bytes)`,
// ]);

const FLAG_DYNAMIC = 0x01;

const MAX_CONSTS = 32;

const OP_FOLLOW_CONST = 0 << 5;
const OP_FOLLOW_REF   = 1 << 5;
const OP_ADD_CONST    = 2 << 5;
const OP_END          = 0xFF;

export class EVMRequestV1 {
	target: HexString;
	readonly commands: HexString[];
	readonly constants: HexString[];
	private readonly buf: number[];
	constructor(target: HexString = ethers.ZeroAddress, commands: HexString[] = [], constants: HexString[] = [], buf: number[] = []) {
		this.target = target;
		this.commands = commands;
		this.constants = constants;
		this.buf = buf;
	}
	clone() {
		return new EVMRequestV1(this.target, this.commands.slice(), this.constants.slice(), this.buf.slice());
	}
	private addConst(x: BytesLike) {
		if (this.constants.length >= MAX_CONSTS) throw new Error('constants overflow');
		this.constants.push(ethers.hexlify(x));
		return this.constants.length-1;
	}
	private start(flags: number, slot: BigNumberish) {
		this.end();
		this.buf.push(flags);
		return this.offset(slot);
	}
	end() {
		let {buf} = this;
		if (!buf.length) return;
		if (buf.length < 32 && buf[buf.length-1] != OP_END) buf.push(OP_END);
		let bytes32 = new Uint8Array(32);
		bytes32.set(buf);
		this.commands.push(ethers.hexlify(bytes32));
		buf.length = 0;
	}
	getStatic(slot: BigNumberish)  { return this.start(0, slot); }
	getDynamic(slot: BigNumberish) { return this.start(FLAG_DYNAMIC, slot); }
	ref(i: number) {
		if (!Number.isInteger(i) || i < 0 || i >= MAX_CONSTS) throw new Error(`invalid reference: ${i}`);
		this.buf.push(OP_FOLLOW_REF | i);
		return this;
	}
	element(x: BigNumberish) { return this.elementBytes(ethers.toBeHex(x, 32)); }
	elementStr(s: string) { return this.elementBytes(ethers.toUtf8Bytes(s)); }
	elementBytes(x: BytesLike) {
		this.buf.push(OP_FOLLOW_CONST | this.addConst(x));
		return this;
	}
	offset(x: BigNumberish) {
		this.buf.push(OP_ADD_CONST | this.addConst(ethers.toBeHex(x, 32)));
		return this;
	}
	// encodeCall() {
	// 	this.end();
	// 	return GATEWAY_ABI.encodeFunctionData('getStorageSlots', [this.target, this.commands, this.constants]);
	// }
	v2() {
		this.end();
		let req = new EVMRequest(0);
		req.push(this.target).target();
		for (let cmd of this.commands) {
			try {
				let v = ethers.getBytes(cmd);
				req.zeroSlot();
				for (let i = 1; i < v.length; i++) {
					let op = v[i];
					if (op === OP_END) break;
					let operand = op & 0x1F;
					switch (op & 0xE0) {
						case OP_ADD_CONST: {
							req.pushBytes(this.constants[operand]).addSlot();
							continue;
						}
						case OP_FOLLOW_CONST: {
							req.pushBytes(this.constants[operand]).follow();
							continue;
						}
						case OP_FOLLOW_REF: {
							req.pushOutput(operand).follow();
							continue;
						}
						default: throw new Error(`unknown op: ${op}`);
					}
				}
				if (v[0] & FLAG_DYNAMIC) {
					req.readBytes();
				} else {
					req.read();
				}
				req.addOutput();
			} catch (err) {
				Object.assign(err!, {cmd});
				throw err;
			}
		}
		return req;
	}
}