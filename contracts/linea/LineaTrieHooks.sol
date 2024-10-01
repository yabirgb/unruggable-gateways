// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IProverHooks} from '../IProverHooks.sol';
import {SparseMerkleProof} from './SparseMerkleProof.sol';
import {NOT_A_CONTRACT, NULL_CODE_HASH, InvalidProof} from '../ProofUtils.sol';

contract LineaTrieHooks is IProverHooks {
    uint256 constant LAST_LEAF_INDEX = 41;

    struct Proof {
        uint256 leafIndex;
        bytes value;
        bytes[] nodes;
    }

    function proveAccountState(
        bytes32 stateRoot,
        address target,
        bytes memory encodedProof
    ) external pure returns (bytes32) {
		// NOTE: we cant decode this as Proof[] due to absolute dogshit abi.decode() codegen
		// instead, right nodes are empty when only 1 proof
        (Proof memory proof, Proof memory right) = abi.decode(encodedProof, (Proof, Proof));
        bytes32 hKey = SparseMerkleProof.mimcHash(abi.encode(target));
        if (right.nodes.length == 0) {
            _requireExistance(
                stateRoot,
                hKey,
                SparseMerkleProof.hashAccountValue(proof.value),
                proof
            );
            SparseMerkleProof.Account memory account = SparseMerkleProof
                .getAccount(proof.value);
            return
                account.keccakCodeHash == NULL_CODE_HASH
                    ? NOT_A_CONTRACT
                    : account.storageRoot;
        } else {
            _requireAbsence(stateRoot, hKey, proof, right);
            return NOT_A_CONTRACT;
        }
    }

    function proveStorageValue(
        bytes32 storageRoot,
        address,
        uint256 slot,
        bytes memory encodedProof
    ) external pure returns (bytes32) {
        (Proof memory proof, Proof memory right) = abi.decode(encodedProof, (Proof, Proof));
        bytes32 hKey = SparseMerkleProof.hashStorageValue(bytes32(slot));
        if (right.nodes.length == 0) {
            bytes32 value = bytes32(proof.value);
            _requireExistance(
                storageRoot,
                hKey,
                SparseMerkleProof.hashStorageValue(value),
                proof
            );
            return value;
        } else {
            _requireAbsence(storageRoot, hKey, proof, right);
            return bytes32(0);
        }
    }

    // 20240917: 1.3m gas
    function _requireExistance(
        bytes32 root,
        bytes32 hKey,
        bytes32 hValue,
        Proof memory proof
    ) internal pure {
        if (!SparseMerkleProof.verifyProof(proof.nodes, proof.leafIndex, root))
            revert InvalidProof();
        SparseMerkleProof.Leaf memory leaf = SparseMerkleProof.getLeaf(
            proof.nodes[LAST_LEAF_INDEX]
        );
        if (hKey != leaf.hKey || hValue != leaf.hValue) revert InvalidProof();
    }

    // 20240917: 2.5m gas
    // 20240921: https://github.com/Consensys/shomei/issues/97
	// 20240927: https://github.com/Consensys/shomei/pull/92 fix deployed to prod
    function _requireAbsence(
        bytes32 root,
        bytes32 hKey,
        Proof memory proofL,
		Proof memory proofR
    ) internal pure {
        // check proofs are valid
        if (
            !SparseMerkleProof.verifyProof(proofL.nodes, proofL.leafIndex, root)
        ) revert InvalidProof();
        if (
            !SparseMerkleProof.verifyProof(proofR.nodes, proofR.leafIndex, root)
        ) revert InvalidProof();
        SparseMerkleProof.Leaf memory leafL = SparseMerkleProof.getLeaf(
            proofL.nodes[LAST_LEAF_INDEX]
        );
        SparseMerkleProof.Leaf memory leafR = SparseMerkleProof.getLeaf(
            proofR.nodes[LAST_LEAF_INDEX]
        );
        // check adjacent
        if (leafL.next != proofR.leafIndex || leafR.prev != proofL.leafIndex)
            revert InvalidProof();
        // check interval
        if (leafL.hKey >= hKey || leafR.hKey <= hKey) revert InvalidProof();
        // console2.logBytes32(leafL.hKey);
        // console2.logBytes32(hKey);
        // console2.logBytes32(leafR.hKey);
    }
}
