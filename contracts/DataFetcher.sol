// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ProtocolData.sol";

library DataFetcher {

	using DataFetcher for DataRequest;
	
	function newRequest(uint8 outputs) internal pure returns (DataRequest memory) {
		return newCommand().addByte(outputs);
	}
	function newCommand() internal pure returns (DataRequest memory) {
		bytes memory v = new bytes(MAX_OPS);
		bytes[] memory m = new bytes[](MAX_INPUTS);
		assembly {
			mstore(v, 0)
			mstore(m, 0)
		}
		return DataRequest(v, m);
	}

	function addByte(DataRequest memory r, uint8 i) internal pure returns (DataRequest memory) {
		bytes memory v = r.ops;
		uint256 n = v.length;
		if (n >= MAX_OPS) revert RequestOverflow();
		assembly { mstore(v, add(n, 1)) }
		v[n] = bytes1(i);
		return r;
	}
	function addShort(DataRequest memory r, uint16 i) internal pure returns (DataRequest memory) {
		return r.addByte(uint8(i >> 8)).addByte(uint8(i));
	}
	function addInput(DataRequest memory r, bytes memory v) internal pure returns (uint8 i) {
		bytes[] memory m = r.inputs;
		uint256 n = m.length;
		if (n >= MAX_INPUTS) revert RequestOverflow();
		assembly { mstore(m, add(n, 1)) }
		m[n] = v;
		return uint8(n);
	}

	function encode(DataRequest memory r) internal pure returns (bytes memory) {
		return abi.encode(r.ops, r.inputs);
	}

	// function outputCount(DataRequest memory r) internal pure returns (uint8) {
	// 	return uint8(r.ops[0]);
	// }

	function debug(DataRequest memory r, string memory label) internal pure returns (DataRequest memory) {
		return r.addByte(OP_DEBUG).addByte(r.addInput(bytes(label)));
	}

	function target(DataRequest memory r) internal pure returns (DataRequest memory) { return r.addByte(OP_TARGET); }
	function requireContract(DataRequest memory r) internal pure returns (DataRequest memory) { return r.addByte(OP_REQ_CONTRACT); }

	function setOutput(DataRequest memory r, uint8 i) internal pure returns (DataRequest memory) { return r.addByte(OP_SET_OUTPUT).addByte(i); }
	
	function read(DataRequest memory r) internal pure returns (DataRequest memory) { return r.addByte(OP_READ_SLOTS).addByte(1); }
	function read(DataRequest memory r, uint8 n) internal pure returns (DataRequest memory) { return r.addByte(OP_READ_SLOTS).addByte(n); }
	function readBytes(DataRequest memory r) internal pure returns (DataRequest memory) { return r.addByte(OP_READ_BYTES); }
	function readArray(DataRequest memory r, uint8 step) internal pure returns (DataRequest memory) { return r.addByte(OP_READ_ARRAY).addByte(step); }
	
	function push(DataRequest memory r, uint256 x) internal pure returns (DataRequest memory) { return push(r, abi.encode(x)); }
	function push(DataRequest memory r, address x) internal pure returns (DataRequest memory) { return push(r, abi.encode(x)); }
	function push(DataRequest memory r, bytes32 x) internal pure returns (DataRequest memory) { return push(r, abi.encode(x)); }
	function push(DataRequest memory r, string memory s) internal pure returns (DataRequest memory) { return push(r, bytes(s)); }
	function push(DataRequest memory r, DataRequest memory x) internal pure returns (DataRequest memory) { return push(r, x.encode()); }
	function push(DataRequest memory r, bytes memory v) internal pure returns (DataRequest memory) { 
		return r.addByte(OP_PUSH_INPUT).addByte(r.addInput(v)); 
	}
	
	function pop(DataRequest memory r) internal pure returns (DataRequest memory) { return r.addByte(OP_POP); }
	function dup(DataRequest memory r, uint8 back) internal pure returns (DataRequest memory) { return r.addByte(OP_DUP).addByte(back); }
	function requireNonzero(DataRequest memory r, uint8 back) internal pure returns (DataRequest memory) { return r.addByte(OP_REQ_NONZERO).addByte(back); }

	function pushInput(DataRequest memory r, uint8 i) internal pure returns (DataRequest memory) { return r.addByte(OP_PUSH_INPUT).addByte(i); }
	function pushOutput(DataRequest memory r, uint8 i) internal pure returns (DataRequest memory) { return r.addByte(OP_PUSH_OUTPUT).addByte(i); }

	function pushTarget(DataRequest memory r) internal pure returns (DataRequest memory) { return r.addByte(OP_PUSH_TARGET); }
	function pushSlot(DataRequest memory r) internal pure returns (DataRequest memory) { return r.addByte(OP_PUSH_SLOT); }

	function addSlot(DataRequest memory r) internal pure returns (DataRequest memory) { return r.addByte(OP_SLOT_ADD); }
	function zeroSlot(DataRequest memory r) internal pure returns (DataRequest memory) { return r.addByte(OP_SLOT_ZERO); }	
	function follow(DataRequest memory r) internal pure returns (DataRequest memory) { return r.addByte(OP_SLOT_FOLLOW); }

	// function follow(DataRequest memory r, uint256 x) internal pure returns (DataRequest memory) { return r.push(x).follow(); }
	// function follow(DataRequest memory r, bytes32 x) internal pure returns (DataRequest memory) { return r.push(x).follow(); }
	// function follow(DataRequest memory r, address x) internal pure returns (DataRequest memory) { return r.push(x).follow(); }
	// function follow(DataRequest memory r, string memory s) internal pure returns (DataRequest memory) { return r.push(s).follow(); }
	// function follow(DataRequest memory r, bytes memory v) internal pure returns (DataRequest memory) { return r.push(v).follow(); }

	function concat(DataRequest memory r) internal pure returns (DataRequest memory) {
		return r.addByte(OP_CONCAT);
	}
 	function keccak(DataRequest memory r) internal pure returns (DataRequest memory) {
		return r.addByte(OP_KECCAK);
	}
	function slice(DataRequest memory r, uint16 pos, uint16 len) internal pure returns (DataRequest memory) {
		return r.addByte(OP_SLICE).addShort(pos).addShort(len);
	}

	function eval(DataRequest memory r) internal pure returns (DataRequest memory) { return r.addByte(OP_EVAL_INLINE); }

	function evalLoop(DataRequest memory r, uint8 flags) internal pure returns (DataRequest memory) { return r.evalLoop(flags, 255); }
	function evalLoop(DataRequest memory r, uint8 flags, uint8 back) internal pure returns (DataRequest memory) {
		return r.addByte(OP_EVAL_LOOP).addByte(back).addByte(flags);
	}

	// shorthand
	function offset(DataRequest memory r, uint256 x) internal pure returns (DataRequest memory) { return r.push(x).addSlot(); }
	function setSlot(DataRequest memory r, uint256 x) internal pure returns (DataRequest memory) { return r.zeroSlot().offset(x); }
	function setTarget(DataRequest memory r, address a) internal pure returns (DataRequest memory) { return r.push(a).target(); }

}
