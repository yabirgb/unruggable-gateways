// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./GatewayProtocol.sol";

library GatewayFetcher {

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
	function addShort(GatewayRequest memory r, uint16 i) internal pure returns (GatewayRequest memory) {
		return r.addByte(uint8(i >> 8)).addByte(uint8(i));
	}
	function addInput(GatewayRequest memory r, bytes memory v) internal pure returns (uint8 i) {
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
		return r.addByte(OP_DEBUG).addByte(r.addInput(bytes(label)));
	}

	function target(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_TARGET); }
	function requireContract(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_REQ_CONTRACT); }

	function setOutput(GatewayRequest memory r, uint8 i) internal pure returns (GatewayRequest memory) { return r.addByte(OP_SET_OUTPUT).addByte(i); }
	
	function read(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_READ_SLOTS).addByte(1); }
	function read(GatewayRequest memory r, uint8 n) internal pure returns (GatewayRequest memory) { return r.addByte(OP_READ_SLOTS).addByte(n); }
	function readBytes(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_READ_BYTES); }
	function readArray(GatewayRequest memory r, uint8 step) internal pure returns (GatewayRequest memory) { return r.addByte(OP_READ_ARRAY).addByte(step); }
	
	function push(GatewayRequest memory r, uint256 x) internal pure returns (GatewayRequest memory) { return push(r, abi.encode(x)); }
	function push(GatewayRequest memory r, address x) internal pure returns (GatewayRequest memory) { return push(r, abi.encode(x)); }
	function push(GatewayRequest memory r, bytes32 x) internal pure returns (GatewayRequest memory) { return push(r, abi.encode(x)); }
	function push(GatewayRequest memory r, string memory s) internal pure returns (GatewayRequest memory) { return push(r, bytes(s)); }
	function push(GatewayRequest memory r, GatewayRequest memory x) internal pure returns (GatewayRequest memory) { return push(r, x.encode()); }
	function push(GatewayRequest memory r, bytes memory v) internal pure returns (GatewayRequest memory) { 
		return r.addByte(OP_PUSH_INPUT).addByte(r.addInput(v)); 
	}
	
	function pop(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_POP); }
	function dup(GatewayRequest memory r, uint8 back) internal pure returns (GatewayRequest memory) { return r.addByte(OP_DUP).addByte(back); }
	function requireNonzero(GatewayRequest memory r, uint8 back) internal pure returns (GatewayRequest memory) { return r.addByte(OP_REQ_NONZERO).addByte(back); }

	function pushInput(GatewayRequest memory r, uint8 i) internal pure returns (GatewayRequest memory) { return r.addByte(OP_PUSH_INPUT).addByte(i); }
	function pushOutput(GatewayRequest memory r, uint8 i) internal pure returns (GatewayRequest memory) { return r.addByte(OP_PUSH_OUTPUT).addByte(i); }

	function pushTarget(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_PUSH_TARGET); }
	function pushSlot(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_PUSH_SLOT); }

	function addSlot(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_SLOT_ADD); }
	function zeroSlot(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_SLOT_ZERO); }	
	function follow(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_SLOT_FOLLOW); }

	// function follow(GatewayRequest memory r, uint256 x) internal pure returns (GatewayRequest memory) { return r.push(x).follow(); }
	// function follow(GatewayRequest memory r, bytes32 x) internal pure returns (GatewayRequest memory) { return r.push(x).follow(); }
	// function follow(GatewayRequest memory r, address x) internal pure returns (GatewayRequest memory) { return r.push(x).follow(); }
	// function follow(GatewayRequest memory r, string memory s) internal pure returns (GatewayRequest memory) { return r.push(s).follow(); }
	// function follow(GatewayRequest memory r, bytes memory v) internal pure returns (GatewayRequest memory) { return r.push(v).follow(); }

	function concat(GatewayRequest memory r) internal pure returns (GatewayRequest memory) {
		return r.addByte(OP_CONCAT);
	}
 	function keccak(GatewayRequest memory r) internal pure returns (GatewayRequest memory) {
		return r.addByte(OP_KECCAK);
	}
	function slice(GatewayRequest memory r, uint16 pos, uint16 len) internal pure returns (GatewayRequest memory) {
		return r.addByte(OP_SLICE).addShort(pos).addShort(len);
	}

	function eval(GatewayRequest memory r) internal pure returns (GatewayRequest memory) { return r.addByte(OP_EVAL_INLINE); }

	function evalLoop(GatewayRequest memory r, uint8 flags) internal pure returns (GatewayRequest memory) { return r.evalLoop(flags, 255); }
	function evalLoop(GatewayRequest memory r, uint8 flags, uint8 back) internal pure returns (GatewayRequest memory) {
		return r.addByte(OP_EVAL_LOOP).addByte(back).addByte(flags);
	}

	// shorthand
	function offset(GatewayRequest memory r, uint256 x) internal pure returns (GatewayRequest memory) { return r.push(x).addSlot(); }
	function setSlot(GatewayRequest memory r, uint256 x) internal pure returns (GatewayRequest memory) { return r.zeroSlot().offset(x); }
	function setTarget(GatewayRequest memory r, address a) internal pure returns (GatewayRequest memory) { return r.push(a).target(); }

}
