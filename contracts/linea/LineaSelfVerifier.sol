// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractSelfVerifier} from "../AbstractSelfVerifier.sol";
import {LineaTrieHooks} from "./LineaTrieHooks.sol";

contract LineaSelfVerifier is AbstractSelfVerifier {
	
	function proveAccountState(bytes32 stateRoot, address target, bytes memory encodedProof) public override pure returns (bytes32) {
		return LineaTrieHooks.proveAccountState(stateRoot, target, encodedProof);
	}

	function proveStorageValue(bytes32 storageRoot, address target, uint256 slot, bytes memory encodedProof) public override pure returns (bytes32) {
		return LineaTrieHooks.proveStorageValue(storageRoot, target, slot, encodedProof);
	}

}
