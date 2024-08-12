// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {EVMRequest, EVMProver, ProofSequence} from "../EVMProver.sol";
import {ScrollTrieHelper, IPoseidon} from "./ScrollTrieHelper.sol";

contract ScrollSelfVerifier {

	IPoseidon immutable _poseidon;
	constructor(IPoseidon poseidon) {
		_poseidon = poseidon;
	}

	function verify(EVMRequest memory req, bytes32 stateRoot, bytes[] memory proofs, bytes memory order) external view returns (bytes[] memory outputs, uint8 exitCode) {
		return EVMProver.evalRequest(req, ProofSequence(0, stateRoot, proofs, order, verify_proveAccountState, verify_proveStorageValue));
	}
	function verify_proveAccountState(bytes32 stateRoot, address target, bytes memory proof) internal view returns (bytes32) {
		return ScrollTrieHelper.proveAccountState(_poseidon, stateRoot, target, abi.decode(proof, (bytes[])));
	}
	function verify_proveStorageValue(bytes32 storageRoot, address, uint256 slot, bytes memory proof) internal view returns (uint256) {
		return uint256(ScrollTrieHelper.proveStorageValue(_poseidon, storageRoot, slot, abi.decode(proof, (bytes[]))));
	}

}
