// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractSelfVerifier} from "../AbstractSelfVerifier.sol";
import {IZKSyncSMT, TreeEntry, ACCOUNT_CODE_HASH} from "./IZKSyncSMT.sol";
import {NOT_A_CONTRACT} from "../ProofUtils.sol";

contract ZKSyncSelfVerifier is AbstractSelfVerifier {

	IZKSyncSMT immutable _smt;
	constructor(IZKSyncSMT smt) {
		_smt = smt;
	}

	function proveAccountState(bytes32 root, address target, bytes memory proof) public override view returns (bytes32) {
		return proof.length > 0 && _proveValue(root, ACCOUNT_CODE_HASH, uint160(target), proof) == 0 ? NOT_A_CONTRACT : root;
	}

	function proveStorageValue(bytes32 root, address target, uint256 slot, bytes memory proof) public override view returns (bytes32) {
		return _proveValue(root, target, slot, proof);
	}

	// same as ZKSyncVerifier.sol:_proveValue()
	function _proveValue(bytes32 root, address target, uint256 slot, bytes memory proof) internal view returns (bytes32) {
		(bytes32 value, uint64 leafIndex, bytes32[] memory path) = abi.decode(proof, (bytes32, uint64, bytes32[]));
		require(root == _smt.getRootHash(path, TreeEntry(slot, value, leafIndex), target), "ZKS: proof");
		return value;
	}

}
