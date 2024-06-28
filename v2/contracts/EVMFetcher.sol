// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./EVMProtocol.sol";

library EVMFetcher {

	using EVMFetcher for EVMRequest;
	
	function newRequest(uint8 outputs) internal pure returns (EVMRequest memory) {
		return newCommand().addByte(outputs);
	}
	function newCommand() internal pure returns (EVMRequest memory) {
		bytes memory v = new bytes(MAX_OPS);
		bytes[] memory m = new bytes[](MAX_INPUTS);
		assembly {
			mstore(v, 0)
			mstore(m, 0)
		}
		return EVMRequest(v, m);
	}

	function addByte(EVMRequest memory r, uint8 i) internal pure returns (EVMRequest memory) {
		bytes memory v = r.ops;
		uint256 n = v.length;
		if (n >= MAX_OPS) revert RequestOverflow();
		assembly { mstore(v, add(n, 1)) }
		v[n] = bytes1(i);
		return r;
	}
	function addShort(EVMRequest memory r, uint16 i) internal pure returns (EVMRequest memory) {
		return r.addByte(uint8(i >> 8)).addByte(uint8(i));
	}
	function addInput(EVMRequest memory r, bytes memory v) internal pure returns (uint8 i) {
		bytes[] memory m = r.inputs;
		uint256 n = m.length;
		if (n >= MAX_INPUTS) revert RequestOverflow();
		assembly { mstore(m, add(n, 1)) }
		m[n] = v;
		return uint8(n);
	}

	function encode(EVMRequest memory r) internal pure returns (bytes memory) {
		return abi.encode(r.ops, r.inputs);
	}

	// function outputCount(EVMRequest memory r) internal pure returns (uint8) {
	// 	return uint8(r.ops[0]);
	// }

	function debug(EVMRequest memory r, string memory label) internal pure returns (EVMRequest memory) {
		return r.addByte(OP_DEBUG).addByte(r.addInput(bytes(label)));
	}

	function target(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addByte(OP_TARGET); }
	function requireContract(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addByte(OP_REQ_CONTRACT); }

	function setOutput(EVMRequest memory r, uint8 i) internal pure returns (EVMRequest memory) { return r.addByte(OP_SET_OUTPUT).addByte(i); }
	
	function read(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addByte(OP_READ_SLOTS).addByte(1); }
	function read(EVMRequest memory r, uint8 n) internal pure returns (EVMRequest memory) { return r.addByte(OP_READ_SLOTS).addByte(n); }
	function readBytes(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addByte(OP_READ_BYTES); }
	function readArray(EVMRequest memory r, uint8 step) internal pure returns (EVMRequest memory) { return r.addByte(OP_READ_ARRAY).addByte(step); }
	
	function push(EVMRequest memory r, uint256 x) internal pure returns (EVMRequest memory) { return push(r, abi.encode(x)); }
	function push(EVMRequest memory r, address x) internal pure returns (EVMRequest memory) { return push(r, abi.encode(x)); }
	function push(EVMRequest memory r, bytes32 x) internal pure returns (EVMRequest memory) { return push(r, abi.encode(x)); }
	function push(EVMRequest memory r, string memory s) internal pure returns (EVMRequest memory) { return push(r, bytes(s)); }
	function push(EVMRequest memory r, EVMRequest memory x) internal pure returns (EVMRequest memory) { return push(r, x.encode()); }
	function push(EVMRequest memory r, bytes memory v) internal pure returns (EVMRequest memory) { 
		return r.addByte(OP_PUSH_INPUT).addByte(r.addInput(v)); 
	}
	
	function pop(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addByte(OP_POP); }
	function dup(EVMRequest memory r, uint8 back) internal pure returns (EVMRequest memory) { return r.addByte(OP_DUP).addByte(back); }
	function requireNonzero(EVMRequest memory r, uint8 back) internal pure returns (EVMRequest memory) { return r.addByte(OP_REQ_NONZERO).addByte(back); }

	function pushInput(EVMRequest memory r, uint8 i) internal pure returns (EVMRequest memory) { return r.addByte(OP_PUSH_INPUT).addByte(i); }
	function pushOutput(EVMRequest memory r, uint8 i) internal pure returns (EVMRequest memory) { return r.addByte(OP_PUSH_OUTPUT).addByte(i); }

	function readTarget(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addByte(OP_PUSH_TARGET); }
	function readSlot(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addByte(OP_PUSH_SLOT); }

	function addSlot(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addByte(OP_SLOT_ADD); }
	function zeroSlot(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addByte(OP_SLOT_ZERO); }	
	function follow(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addByte(OP_SLOT_FOLLOW); }

	// function follow(EVMRequest memory r, uint256 x) internal pure returns (EVMRequest memory) { return r.push(x).follow(); }
	// function follow(EVMRequest memory r, bytes32 x) internal pure returns (EVMRequest memory) { return r.push(x).follow(); }
	// function follow(EVMRequest memory r, address x) internal pure returns (EVMRequest memory) { return r.push(x).follow(); }
	// function follow(EVMRequest memory r, string memory s) internal pure returns (EVMRequest memory) { return r.push(s).follow(); }
	// function follow(EVMRequest memory r, bytes memory v) internal pure returns (EVMRequest memory) { return r.push(v).follow(); }

	function concat(EVMRequest memory r, uint8 n) internal pure returns (EVMRequest memory) {
		return r.addByte(OP_STACK_CONCAT).addByte(n);
	}
 	function keccak(EVMRequest memory r) internal pure returns (EVMRequest memory) {
		return r.addByte(OP_STACK_KECCAK);
	}
	function slice(EVMRequest memory r, uint16 pos, uint16 len) internal pure returns (EVMRequest memory) {
		return r.addByte(OP_STACK_SLICE).addShort(pos).addShort(len);
	}

	function eval(EVMRequest memory r, uint8 flags) internal pure returns (EVMRequest memory) { return r.eval(flags, 255); }
	function eval(EVMRequest memory r, uint8 flags, uint8 back) internal pure returns (EVMRequest memory) {
		return r.addByte(OP_EVAL).addByte(back).addByte(flags);
	}

	// shorthand
	function offset(EVMRequest memory r, uint256 x) internal pure returns (EVMRequest memory) { return r.push(x).addSlot(); }
	function setSlot(EVMRequest memory r, uint256 x) internal pure returns (EVMRequest memory) { return r.zeroSlot().offset(x); }
	function setTarget(EVMRequest memory r, address a) internal pure returns (EVMRequest memory) { return r.push(a).target(); }

}
