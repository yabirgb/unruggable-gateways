// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {EVMRequest, EVMProver, ProofSequence, NOT_A_CONTRACT} from "../EVMProver.sol";
import {IZKSyncSMT, TreeEntry, ACCOUNT_CODE_HASH} from "./IZKSyncSMT.sol";

//import "forge-std/console2.sol";

contract ZKSyncSelfVerifier {

	IZKSyncSMT immutable _smt;

	constructor(IZKSyncSMT smt) {
		_smt = smt;
	}

	function verify(EVMRequest memory req, bytes32 stateRoot, bytes[] memory proofs, bytes memory order) external view returns (bytes[] memory outputs, uint8 exitCode) {
		return EVMProver.evalRequest(req, ProofSequence(0, 
			stateRoot,
			proofs, order,
			proveAccountState,
			proveStorageValue
		));
	}

	function proveAccountState(bytes32 root, address target, bytes memory proof) public view returns (bytes32) {
		return proof.length > 0 && _proveValue(root, ACCOUNT_CODE_HASH, uint160(target), proof) == 0 ? NOT_A_CONTRACT : root;
	}

	function proveStorageValue(bytes32 root, address target, uint256 slot, bytes memory proof) public view returns (bytes32) {
		return _proveValue(root, target, slot, proof);
	}

	function _proveValue(bytes32 root, address target, uint256 slot, bytes memory proof) internal view returns (bytes32) {
		//uint256 g = gasleft();
		(bytes32 value, uint64 leafIndex, bytes32[] memory path) = abi.decode(proof, (bytes32, uint64, bytes32[]));
		require(root == _smt.getRootHash(path, TreeEntry(slot, value, leafIndex), target), "ZKS: proof");
		//console2.log("Gas: %s", g - gasleft());
		return value;
	}


}