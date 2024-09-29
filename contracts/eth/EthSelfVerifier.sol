// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractSelfVerifier} from "../AbstractSelfVerifier.sol";
import {EthTrieHooks} from "./EthTrieHooks.sol";

contract EthSelfVerifier is AbstractSelfVerifier { 

	function proveAccountState(bytes32 stateRoot, address target, bytes memory encodedProof) public override pure returns (bytes32) {
		return EthTrieHooks.proveAccountState(stateRoot, target, encodedProof);
	}

	function proveStorageValue(bytes32 storageRoot, address target, uint256 slot, bytes memory encodedProof) public override pure returns (bytes32) {
		return EthTrieHooks.proveStorageValue(storageRoot, target, slot, encodedProof);
	}

}
