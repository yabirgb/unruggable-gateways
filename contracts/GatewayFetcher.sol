// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./GatewayRequest.sol";

library GatewayFetcher {

	// these are only limits of the builder
	// verifier execution is only constrainted by stack and gas
	// max outputs = 255
	uint256 constant MAX_OPS = 2048;
	uint256 constant MAX_INPUTS = 64;

	// thrown if limits above are exceeded
	error RequestOverflow();

	using GatewayFetcher for GatewayRequest;
	
	function newRequest(uint8 outputs) internal pure returns (GatewayRequest memory) {
		return newCommand().addByte(outputs);
	}
	function newCommand() internal pure returns (GatewayRequest memory) {
		bytes memory v = new bytes(MAX_OPS);
		bytes[] memory m = new bytes[](MAX_INPUTS);
		assembly {
			mstore(v, 0)
			mstore(m, 0)
		}
		return GatewayRequest(v, m);
	}

	function addByte(GatewayRequest memory r, uint8 i) internal pure returns (GatewayRequest memory) {
		bytes memory v = r.ops;
		uint256 n = v.length;
		if (n >= MAX_OPS) revert RequestOverflow();
		assembly { mstore(v, add(n, 1)) }
		v[n] = bytes1(i);
		return r;
	}
	function addSmallBytes(GatewayRequest memory r, bytes memory v) internal pure returns (GatewayRequest memory) {
		if (v.length > 255) revert RequestOverflow();
		r.addByte(uint8(v.length));
		bytes memory buf = r.ops;
		assembly {
			let dst := add(add(buf, 32), mload(buf))
			let src := add(v, 32)
			let src_end := add(src, mload(v))
			for {} lt(src, src_end) {} {
				mstore(dst, mload(src))
				src := add(src, 32)
				dst := add(dst, 32)
			}
			mstore(buf, add(mload(buf), mload(v)))
		}
		return r;
	}

	function defineInput(GatewayRequest memory r, bytes memory v) internal pure returns (uint256 i) {
		bytes[] memory m = r.inputs;
		uint256 n = m.length;
		if (n >= MAX_INPUTS) revert RequestOverflow();
		assembly { mstore(m, add(n, 1)) }
		m[n] = v;
		return uint8(n);
	}

	function encode(GatewayRequest memory r) internal pure returns (bytes memory) {
		return abi.encode(r.ops, r.inputs);
	}

	// function outputCount(GatewayRequest memory r) internal pure returns (uint8) {
	// 	return uint8(r.ops[0]);
	// }

	function debug(GatewayRequest memory r, string memory label) internal pure returns (GatewayRequest memory) {
		return r.addByte(OP_DEBUG).addSmallBytes(bytes(label));
	}

	//function push0(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_PUSH_0); }
	function push(GatewayRequest memory r, bytes32 x) internal pure returns (GatewayRequest memory) { return r.push(uint256(x)); }
	function push(GatewayRequest memory r, address x) internal pure returns (GatewayRequest memory) { return r.push(uint160(x)); }
	function push(GatewayRequest memory r, string memory s) internal pure returns (GatewayRequest memory) { return push(r, bytes(s)); }
	function push(GatewayRequest memory r, GatewayRequest memory p) internal pure returns (GatewayRequest memory) { return push(r, p.encode()); }

	function clz(uint256 x) private pure returns (uint8 n) {
		if (x <= 0x00000000000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF) { n |= 16; x <<= 128; }
		if (x <= 0x0000000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF) { n |= 8; x <<= 64; }
		if (x <= 0x00000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF) { n |= 4; x <<= 32; }
		if (x <= 0x0000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF) { n |= 2; x <<= 16; }
		if (x <= 0x00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF) { n |= 1; }
	}
	function push(GatewayRequest memory r, uint256 x) internal pure returns (GatewayRequest memory) {
		if (x == 0) return r.addByte(OP_PUSH_0);
		r.addByte(OP_PUSH_VALUE);
		uint8 n = clz(x);
		x <<= (n << 3); // left-align
		n = 32 - n;
		r.addByte(n);
		bytes memory v = r.ops;
		assembly {
			let len := mload(v)
			mstore(add(add(v, 32), len), x)
			mstore(v, add(len, n))
		}
		return r;
	}
	function push(GatewayRequest memory r, bytes memory v) internal pure returns (GatewayRequest memory) {
		return v.length <= 32 ? r.addByte(OP_PUSH_BYTES).addSmallBytes(v) : r.push(r.defineInput(v)).addByte(OP_PUSH_INPUT);
	}

	function pushTarget(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_PUSH_TARGET); }
	function pushSlot(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_PUSH_SLOT); }
	function pushStackSize(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_PUSH_STACK_SIZE); }

	function target(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_TARGET); }
	function setTarget(GatewayRequest memory r, address a) internal pure returns (GatewayRequest memory) { return r.push(a).target(); }
	function requireContract(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_REQ_CONTRACT); }

	function follow(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_SLOT_FOLLOW); }
	//function follow(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.pushSlot().concat().keccak().slot(); }
	function followIndex(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.pushSlot().keccak().slot().addSlot(); }
	function addSlot(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_SLOT_ADD); }
	//function addSlot(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.pushSlot().add().slot(); } 
	function slot(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_SLOT); }
	function setSlot(GatewayRequest memory r, uint256 x) internal pure returns (GatewayRequest memory) { return r.push(x).slot(); }
	function offset(GatewayRequest memory r, uint256 dx) internal pure returns (GatewayRequest memory) { return r.push(dx).addSlot(); }
	//function zeroSlot(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_SLOT_ZERO); } // 20240922: deprecated
	//function zeroSlot(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.push(uint256(0)).slot(); } // alternative

	function setOutput(GatewayRequest memory r, uint8 i) internal pure returns (GatewayRequest memory) { return r.push(i).addByte(OP_SET_OUTPUT); }

	function read(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_READ_SLOT); }
	function read(GatewayRequest memory r, uint256 n) internal pure returns (GatewayRequest memory) { return r.push(n).addByte(OP_READ_SLOTS); }
	function readBytes(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_READ_BYTES); }
	function readArray(GatewayRequest memory r, uint256 step) internal pure returns (GatewayRequest memory) { return r.push(step).addByte(OP_READ_ARRAY); }
	function readHashedBytes(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_READ_HASHED); }

	function pop(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_POP); }
	function dup(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.dup(0); }
	function dup(GatewayRequest memory r, uint8 back) internal pure returns (GatewayRequest memory) { return r.push(back).addByte(OP_DUP); }
	function swap(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.swap(1); }
	function swap(GatewayRequest memory r, uint8 back) internal pure returns (GatewayRequest memory) { return r.push(back).addByte(OP_SWAP); }
	function requireNonzero(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_REQ_NONZERO); }

	function pushInput(GatewayRequest memory r, uint8 i) internal pure returns (GatewayRequest memory) { return r.push(i).addByte(OP_PUSH_INPUT); }
	function pushOutput(GatewayRequest memory r, uint8 i) internal pure returns (GatewayRequest memory) { return r.push(i).addByte(OP_PUSH_OUTPUT); }

	function concat(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_CONCAT); }
 	function keccak(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_KECCAK); }
	function slice(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_SLICE); }
	function slice(GatewayRequest memory r, uint256 pos, uint256 len) internal pure returns (GatewayRequest memory) { return r.push(pos).push(len).slice(); }
	function length(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_LENGTH); }

	function plus(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_PLUS); }
	function times(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_TIMES); }
	function divide(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_DIVIDE); }
	function mod(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_MOD); }
	function and(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_AND); }
	function or(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_OR); }
	function xor(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_XOR); }

	function not(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_NOT); }
	function flip(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.push(uint256(0)).eq(); }

	function shl(GatewayRequest memory r, uint8 shift) internal pure returns (GatewayRequest memory) { return r.push(shift).addByte(OP_SHIFT_LEFT); }
	function shr(GatewayRequest memory r, uint8 shift) internal pure returns (GatewayRequest memory) { return r.push(shift).addByte(OP_SHIFT_RIGHT); }

	function eq(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_EQ); }
	function lt(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_LT); }
	function gt(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_GT); }
	function lte(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_GT).flip(); }
	function gte(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_LT).flip(); }

	function eval(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_EVAL_INLINE); }
	
	function evalLoop(GatewayRequest memory r, uint8 flags) internal pure returns (GatewayRequest memory) { return r.evalLoop(flags, 255); }
	function evalLoop(GatewayRequest memory r, uint8 flags, uint8 back) internal pure returns (GatewayRequest memory) {
		return r.push(back).addByte(OP_EVAL_LOOP).addByte(flags);
	}

}
