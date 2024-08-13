// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {EVMRequest, EVMProver, ProofSequence} from "../EVMProver.sol";
import {LineaTrieCallbacks} from "./LineaTrieCallbacks.sol";

contract LineaSelfVerifier {

	function verify(EVMRequest memory req, bytes32 stateRoot, bytes[] memory proofs, bytes memory order) external view returns (bytes[] memory outputs, uint8 exitCode) {
		return EVMProver.evalRequest(req, ProofSequence(0, 
			stateRoot, 
			proofs, order, 
			LineaTrieCallbacks.proveAccountState, 
			LineaTrieCallbacks.proveStorageValue
		));
	}

	function verify_proveAccountState(bytes32 stateRoot, address target, bytes memory encodedProof) internal pure returns (bytes32) {
		return LineaTrieCallbacks.proveAccountState(stateRoot, target, encodedProof);
	}

	function verify_proveStorageValue(bytes32 storageRoot, address target, uint256 slot, bytes memory encodedProof) internal pure returns (uint256) {
		return uint256(LineaTrieCallbacks.proveStorageValue(storageRoot, target, slot, encodedProof));
	}

}
