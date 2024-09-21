// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractSelfVerifier} from "../AbstractSelfVerifier.sol";
import {ScrollTrieHooks, IPoseidon} from "./ScrollTrieHooks.sol";

contract ScrollSelfVerifier is AbstractSelfVerifier {

	IPoseidon immutable _poseidon;
	constructor(IPoseidon poseidon) {
		_poseidon = poseidon;
	}

	function proveAccountState(bytes32 stateRoot, address target, bytes memory proof) public override view returns (bytes32) {
		return ScrollTrieHooks.proveAccountState(_poseidon, stateRoot, target, abi.decode(proof, (bytes[])));
	}

	function proveStorageValue(bytes32 storageRoot, address, uint256 slot, bytes memory proof) public override view returns (bytes32) {
		return ScrollTrieHooks.proveStorageValue(_poseidon, storageRoot, slot, abi.decode(proof, (bytes[])));
	}

}
