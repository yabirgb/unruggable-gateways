// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {SparseMerkleProof} from "./SparseMerkleProof.sol";
import {NOT_A_CONTRACT, NULL_CODE_HASH} from "../ProofUtils.sol";

import "forge-std/console2.sol";

error InvalidProof();

library LineaTrieCallbacks {

	uint256 constant LAST_LEAF_INDEX = 41;

	struct Proof {
		uint256 leafIndex;
		bytes value;
		bytes[] nodes;
	}

	function proveAccountState(bytes32 stateRoot, address target, bytes memory encodedProof) internal pure returns (bytes32) {
		Proof[] memory proofs = abi.decode(encodedProof, (Proof[]));
		if (proofs.length == 1) {
			Proof memory proof = proofs[0];
			if (!SparseMerkleProof.verifyProof(proof.nodes, proof.leafIndex, stateRoot)) revert InvalidProof();
			bytes32 targetHash = SparseMerkleProof.mimcHash(abi.encode(target));
			SparseMerkleProof.Leaf memory leaf = SparseMerkleProof.getLeaf(proof.nodes[LAST_LEAF_INDEX]);
			if (targetHash != leaf.hKey) revert InvalidProof();
			bytes32 valueHash = SparseMerkleProof.hashAccountValue(proof.value);
			if (valueHash != leaf.hValue) revert InvalidProof();
			SparseMerkleProof.Account memory account = SparseMerkleProof.getAccount(proof.value);
			return account.keccakCodeHash == NULL_CODE_HASH ? NOT_A_CONTRACT : account.storageRoot;
		} else {
			proveDoesNotExist(stateRoot, proofs[0], proofs[1]);
			return NOT_A_CONTRACT;
		}
	}

	function proveDoesNotExist(bytes32 root, Proof memory left, Proof memory right) internal pure {
		if (!SparseMerkleProof.verifyProof(left.nodes, left.leafIndex, root)) revert InvalidProof();
		if (!SparseMerkleProof.verifyProof(right.nodes, right.leafIndex, root)) revert InvalidProof();
		SparseMerkleProof.Leaf memory leaf = SparseMerkleProof.getLeaf(left.nodes[LAST_LEAF_INDEX]);
		if (leaf.next != right.leafIndex) revert InvalidProof();
	}
	
	function proveStorageValue(bytes32 storageRoot, address, uint256 slot, bytes memory encodedProof) internal pure returns (uint256) {
		Proof[] memory proofs = abi.decode(encodedProof, (Proof[]));
		if (proofs.length == 1) {
			Proof memory proof = proofs[0];
			if (!SparseMerkleProof.verifyProof(proof.nodes, proof.leafIndex, storageRoot)) revert InvalidProof();
			SparseMerkleProof.Leaf memory leaf = SparseMerkleProof.getLeaf(proof.nodes[LAST_LEAF_INDEX]);
			if (SparseMerkleProof.hashStorageValue(bytes32(slot)) != leaf.hKey) revert InvalidProof();
			bytes32 value = bytes32(proof.value);
			if (SparseMerkleProof.hashStorageValue(value) != leaf.hValue) revert InvalidProof();
			return uint256(value);
		} else {
			proveDoesNotExist(storageRoot, proofs[0], proofs[1]);
			return 0;
		}
	}

}