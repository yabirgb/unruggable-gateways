// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {GatewayRequest, GatewayProver, ProofSequence} from "../GatewayProver.sol";
import {ScrollTrieHooks, IPoseidon} from "./ScrollTrieHooks.sol";

contract ScrollSelfVerifier {

	IPoseidon immutable _poseidon;
	constructor(IPoseidon poseidon) {
		_poseidon = poseidon;
	}

	function verify(GatewayRequest memory req, bytes32 stateRoot, bytes[] memory proofs, bytes memory order) external view returns (bytes[] memory outputs, uint8 exitCode) {
		return GatewayProver.evalRequest(req, ProofSequence(0, 
			stateRoot,
			proofs, order,
			proveAccountState,
			proveStorageValue
		));
	}

	function proveAccountState(bytes32 stateRoot, address target, bytes memory proof) internal view returns (bytes32) {
		return ScrollTrieHooks.proveAccountState(_poseidon, stateRoot, target, abi.decode(proof, (bytes[])));
	}

	function proveStorageValue(bytes32 storageRoot, address, uint256 slot, bytes memory proof) internal view returns (bytes32) {
		return ScrollTrieHooks.proveStorageValue(_poseidon, storageRoot, slot, abi.decode(proof, (bytes[])));
	}

}
