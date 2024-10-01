// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IProverHooks} from "../IProverHooks.sol";
import {NOT_A_CONTRACT, NULL_CODE_HASH, InvalidProof} from "../ProofUtils.sol";
import {IZKSyncSMT, TreeEntry, ACCOUNT_CODE_HASH} from "./IZKSyncSMT.sol";

contract ZKSyncTrieHooks is IProverHooks {

	IZKSyncSMT immutable _smt; // external library with a constructor
	constructor(IZKSyncSMT smt) {
		_smt = smt;
	}

	function proveAccountState(bytes32 root, address target, bytes memory proof) external view returns (bytes32) {
		// when no account proof is provided, we assume the target is a contract
		// this is safe because zksync uses a single trie and there is no storage root
		return proof.length > 0 && _proveValue(root, ACCOUNT_CODE_HASH, uint160(target), proof) == 0 ? NOT_A_CONTRACT : root;
	}

	function proveStorageValue(bytes32 root, address target, uint256 slot, bytes memory proof) external view returns (bytes32) {
		return _proveValue(root, target, slot, proof);
	}

	// same as ZKSyncVerifier.sol:_proveValue()
	function _proveValue(bytes32 root, address target, uint256 slot, bytes memory proof) internal view returns (bytes32) {
		(bytes32 value, uint64 leafIndex, bytes32[] memory path) = abi.decode(proof, (bytes32, uint64, bytes32[]));
		require(root == _smt.getRootHash(path, TreeEntry(slot, value, leafIndex), target), "ZKS: proof");
		return value;
	}

}