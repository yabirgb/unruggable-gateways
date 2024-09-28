// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./GatewayProtocol.sol";
import "./ProofUtils.sol";

import {Bytes} from "../lib/optimism/packages/contracts-bedrock/src/libraries/Bytes.sol"; // Bytes.slice

import "forge-std/console2.sol"; // DEBUG

library GatewayProver {
	
	uint256 constant MAX_STACK = 64;

	function dump(Machine memory vm) internal view {
		console2.log("[pos=%s/%s]", vm.pos, vm.buf.length);
		if (vm.buf.length < 256) console2.logBytes(vm.buf);
		console2.log("[target=%s slot=%s]", vm.target, vm.slot);
		console2.log("[proof=%s/%s]", vm.proofs.index, vm.proofs.order.length);
		console2.log("[stackSize=%s]", vm.stackSize);
		for (uint256 i; i < vm.stackSize; i++) {
			bytes memory v = vm.stack[i];
			console2.log("%s [size=%s]", i, v.length);
			console2.logBytes(v);
		}
		uint256 mem;
		assembly { mem := mload(64) }
		console2.log("[memory=%s gas=%s]", mem, gasleft());
	}

	function uint256FromBytes(bytes memory v) internal pure returns (uint256) {
		return uint256(v.length < 32 ? bytes32(v) >> ((32 - v.length) << 3) : bytes32(v));
	}
	
	// TODO: this checks beyond bound
	function isZeros(bytes memory v) internal pure returns (bool ret) {
		assembly {
			let p := add(v, 32)
			let e := add(p, mload(v))
			for { ret := 1 } lt(p, e) { p := add(p, 32) } {
				if iszero(iszero(mload(p))) { // != 0
					ret := 0
					break
				}
			}
		}
	}


	struct Machine {
		bytes buf;
		uint256 pos;
		bytes[] inputs;
		bytes[] stack;
		uint256 stackSize;
		address target;
		bytes32 storageRoot;
		uint256 slot;
		ProofSequence proofs;
	}

	using GatewayProver for Machine;

	function pushUint256(Machine memory vm, uint256 x) internal pure { vm.push(abi.encode(x)); }
	function push(Machine memory vm, bytes memory v) internal pure {
		vm.stack[vm.stackSize++] = v;
	}
	function popAsUint256(Machine memory vm) internal pure returns (uint256) { return uint256FromBytes(vm.pop()); }
	function pop(Machine memory vm) internal pure returns (bytes memory) { 
		return vm.stack[--vm.stackSize]; 
	}

	function checkBack(Machine memory vm, uint256 back) internal pure returns (uint256) {
		require(back < vm.stackSize, "back overflow");
		return vm.stackSize - 1 - back;
	}

	function checkRead(Machine memory vm, uint256 n) internal pure returns (uint256 ptr) {
		uint256 pos = vm.pos;
		bytes memory buf = vm.buf;
		if (pos + n > buf.length) revert RequestInvalid();
		assembly { ptr := add(add(buf, 32), pos) }
		vm.pos = pos + n;
	}
	function readByte(Machine memory vm) internal pure returns (uint8 i) {
		uint256 src = vm.checkRead(1);
		assembly { i := shr(248, mload(src)) }
	}
	function readSmallBytesAsWord(Machine memory vm) internal pure returns (uint256 word) {
		uint256 n = vm.readByte();
		if (n != 0) {
			require(n <= 32, "word size");
			uint256 src = vm.checkRead(n);
			assembly { word := mload(src) }
			word >>= (32 - n) << 3;
		}
	}
	function readSmallBytes(Machine memory vm) internal pure returns (bytes memory v) {
		uint256 n = vm.readByte();
		v = Bytes.slice(vm.buf, vm.pos, n);
		vm.pos += n;
	}

	function readProof(Machine memory vm) internal pure returns (bytes memory) {
		ProofSequence memory p = vm.proofs;
		return p.proofs[uint8(p.order[p.index++])];
	}
	function getStorage(Machine memory vm, uint256 slot) internal view returns (uint256) {
		bytes memory proof = vm.readProof();
		if (vm.storageRoot == NOT_A_CONTRACT) return 0;
		return uint256(vm.proofs.proveStorageValue(vm.storageRoot, vm.target, slot, proof));
	}
	function proveSlots(Machine memory vm, uint256 count) internal view returns (bytes memory v) {
		v = new bytes(count << 5);
		for (uint256 i; i < count; ) {
			uint256 value = vm.getStorage(vm.slot + i);
			i += 1;
			assembly { mstore(add(v, shl(5, i)), value) }
		}
	}
	function proveBytes(Machine memory vm) internal view returns (bytes memory v) {
		uint256 first = vm.getStorage(vm.slot);
		if ((first & 1) == 0) { // small
			v = new bytes((first & 0xFF) >> 1);
			assembly { mstore(add(v, 32), first) }
		} else { // large
			uint256 size = first >> 1; // number of bytes
			first = (size + 31) >> 5; // number of slots
			v = new bytes(size);
			uint256 slot = uint256(keccak256(abi.encode(vm.slot))); // array start
			for (uint256 i; i < first; ) {
				uint256 value = vm.getStorage(slot + i);
				i += 1;
				assembly { mstore(add(v, shl(5, i)), value) }
			}
		}
	}
	function proveArray(Machine memory vm, uint256 step) internal view returns (bytes memory v) {
		uint256 first = vm.getStorage(vm.slot);
		uint256 count;
		if (step < 32) {
			uint256 per = 32 / step;
			count = (first + per - 1) / per;
		} else {
			count = first * ((step + 31) >> 5);
		}
		v = new bytes((1 + count) << 5); // +1 for length
		assembly { mstore(add(v, 32), first) } // store length
		uint256 slot = uint256(keccak256(abi.encode(vm.slot))); // array start
		for (uint256 i; i < count; ) {
			uint256 value = vm.getStorage(slot + i);
			i += 1;
			assembly { mstore(add(v, shl(5, add(i, 1))), value) }
		}
	}

	function loadProgram(Machine memory vm, bytes memory v) internal pure {
		(vm.buf, vm.inputs) = abi.decode(v, (bytes, bytes[]));
	}

	function evalRequest(GatewayRequest memory req, ProofSequence memory proofs) internal view returns (bytes[] memory outputs, uint8 exitCode) {
		Machine memory vm;
		vm.pos = 0;
		vm.buf = req.ops;
		vm.inputs = req.inputs;
		vm.stack = new bytes[](MAX_STACK);
		vm.stackSize = 0;
		vm.proofs = proofs;
		vm.target = address(0);
		vm.storageRoot = NOT_A_CONTRACT;
		vm.slot = 0;
		outputs = new bytes[](vm.readByte());
		exitCode = evalCommand(vm, outputs);
	}

	function evalCommand(Machine memory vm, bytes[] memory outputs) internal view returns (uint8 exitCode) {
		while (vm.pos < vm.buf.length) {
			//uint256 g = gasleft();
			uint256 op = vm.readByte();
			if (op == OP_TARGET) {
				vm.target = address(uint160(vm.popAsUint256()));
				vm.storageRoot = vm.proofs.proveAccountState(vm.proofs.stateRoot, vm.target, vm.readProof()); // TODO: balance?
				vm.slot = 0;
			} else if (op == OP_SET_OUTPUT) {
				uint256 i = vm.popAsUint256(); // solidity: rhs evaluates BEFORE lhs
				outputs[i] = vm.pop();
			} else if (op == OP_REQ_CONTRACT) {
				if (vm.storageRoot == NOT_A_CONTRACT) return EXIT_NOT_A_CONTRACT;
			} else if (op == OP_REQ_NONZERO) {
				if (isZeros(vm.stack[vm.checkBack(0)])) return EXIT_NOT_NONZERO;
			} else if (op == OP_READ_SLOT) {
				vm.push(vm.proveSlots(1));
			} else if (op == OP_READ_SLOTS) {
				vm.push(vm.proveSlots(vm.popAsUint256()));
			} else if (op == OP_READ_BYTES) {
				vm.push(vm.proveBytes());
			} else if (op == OP_READ_HASHED) {
				bytes memory v = vm.readProof();
				require(keccak256(v) == bytes32(vm.popAsUint256()), "hashed proof");
				vm.push(v);
			} else if (op == OP_READ_ARRAY) {
				vm.push(vm.proveArray(vm.popAsUint256()));
			} else if (op == OP_SLOT) {
				vm.slot = vm.popAsUint256();
			} else if (op == OP_SLOT_ADD) {
				vm.slot += vm.popAsUint256();
			} else if (op == OP_SLOT_FOLLOW) {
				vm.slot = uint256(keccak256(abi.encodePacked(vm.pop(), vm.slot)));
			} else if (op == OP_PUSH_INPUT) {
				vm.push(vm.inputs[vm.popAsUint256()]);
			} else if (op == OP_PUSH_OUTPUT) {
				vm.push(outputs[vm.popAsUint256()]);
			} else if (op == OP_PUSH_VALUE) {
				vm.pushUint256(vm.readSmallBytesAsWord());
			} else if (op == OP_PUSH_BYTES) {
				vm.push(vm.readSmallBytes());
			} else if (op == OP_PUSH_SLOT) {
				vm.pushUint256(vm.slot);
			} else if (op == OP_PUSH_TARGET) {
				vm.push(abi.encodePacked(vm.target)); // NOTE: 20 bytes
			} else if (op == OP_DUP) {
				vm.push(vm.stack[vm.checkBack(vm.popAsUint256())]);
			} else if (op == OP_POP) {
				if (vm.stackSize != 0) --vm.stackSize;
			} else if (op == OP_SWAP) {
				uint256 i = vm.checkBack(vm.popAsUint256());
				uint256 j = vm.checkBack(0);
				(vm.stack[i], vm.stack[j]) = (vm.stack[j], vm.stack[i]);
			} else if (op == OP_SLICE) {
				uint256 size = vm.popAsUint256();
				uint256 pos = vm.popAsUint256();
				bytes memory v = vm.pop();
				uint256 end = pos + size;
				if (end <= v.length) {
					vm.push(Bytes.slice(v, pos, size));
				} else if (pos >= v.length) { // beyond end
					vm.push(new bytes(size));
				} else { // partial
					vm.push(bytes.concat(
						Bytes.slice(v, pos, v.length - pos),
						new bytes(end - v.length)
					));
				}
			} else if (op == OP_KECCAK) {
				vm.pushUint256(uint256(keccak256(vm.pop())));
			} else if (op == OP_CONCAT) {
				bytes memory last = vm.pop();
				vm.push(bytes.concat(vm.pop(), last));
			} else if (op == OP_PLUS) {
				uint256 last = vm.popAsUint256();
				unchecked { vm.pushUint256(vm.popAsUint256() + last); }
			} else if (op == OP_TIMES) {
				uint256 last = vm.popAsUint256();
				unchecked { vm.pushUint256(vm.popAsUint256() * last); }
			} else if (op == OP_DIVIDE) {
				uint256 last = vm.popAsUint256();
				unchecked { vm.pushUint256(vm.popAsUint256() / last); }
			} else if (op == OP_MOD) {
				uint256 last = vm.popAsUint256();
				vm.pushUint256(vm.popAsUint256() % last);
			} else if (op == OP_AND) {
				uint256 last = vm.popAsUint256();
				vm.pushUint256(vm.popAsUint256() & last);
			} else if (op == OP_OR) {
				uint256 last = vm.popAsUint256();
				vm.pushUint256(vm.popAsUint256() | last);
			} else if (op == OP_XOR) {
				uint256 last = vm.popAsUint256();
				vm.pushUint256(vm.popAsUint256() ^ last);
			} else if (op == OP_SHIFT_LEFT) {
				vm.pushUint256(vm.popAsUint256() << vm.popAsUint256());
			} else if (op == OP_SHIFT_RIGHT) {
				vm.pushUint256(vm.popAsUint256() >> vm.popAsUint256());
			} else if (op == OP_EQ) {
				uint256 last = vm.popAsUint256();
				vm.pushUint256(vm.popAsUint256() == last ? 1 : 0);
			} else if (op == OP_LT) {
				uint256 last = vm.popAsUint256();
				 vm.pushUint256(vm.popAsUint256() < last ? 1 : 0);
			} else if (op == OP_GT) {
				uint256 last = vm.popAsUint256();
				vm.pushUint256(vm.popAsUint256() > last ? 1 : 0);
			} else if (op == OP_NOT) {
				vm.pushUint256(~vm.popAsUint256());
			} else if (op == OP_EVAL_INLINE) {
				bytes memory program = vm.pop();
				uint256 pos = vm.pos;
				bytes memory buf = vm.buf;
				bytes[] memory inputs = vm.inputs; 
				vm.pos = 0;
				vm.loadProgram(program);
				exitCode = evalCommand(vm, outputs);
				if (exitCode != 0) return exitCode;
				vm.pos = pos;
				vm.buf = buf;
				vm.inputs = inputs;
			} else if (op == OP_EVAL_LOOP) {
				uint8 flags = vm.readByte();
				uint256 back = vm.popAsUint256();
				Machine memory vm2;
				vm2.loadProgram(vm.pop());
				vm2.proofs = vm.proofs;
				vm2.stack = new bytes[](MAX_STACK);
				for (; back > 0 && vm.stackSize > 0; --back) {
					vm2.target = vm.target;
					vm2.storageRoot = vm.storageRoot;
					vm2.slot = vm.slot;
					vm2.pos = 0;
					vm2.stackSize = 0;
					vm2.push(vm.pop());
					if ((flags & (evalCommand(vm2, outputs) != 0 ? STOP_ON_FAILURE : STOP_ON_SUCCESS)) != 0) {
						break;
					}
				}
				if ((flags & ACQUIRE_STATE) != 0) {
					vm.target      = vm2.target;
					vm.storageRoot = vm2.storageRoot;
					vm.slot        = vm2.slot;
					vm.stack       = vm2.stack;
					vm.stackSize   = vm2.stackSize;
				} else {
					vm.stackSize = vm.stackSize > back ? vm.stackSize - back : 0;
				}
			} else if (op == OP_DEBUG) {
				console2.log("DEBUG(%s)", string(vm.readSmallBytes()));
				vm.dump();
			} else {
				revert RequestInvalid();
			}
			//console2.log("op=%s gas=%s", op, g - gasleft());
		}
		return 0;
	}

}