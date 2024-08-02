// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../../EVMProtocol.sol";
import {IEVMVerifier} from "../../IEVMVerifier.sol";
import {NOT_A_CONTRACT} from "../../ProofUtils.sol";
import {EVMProver, ProofSequence} from "../../EVMProver.sol";
import {IZKSyncSMT, TreeEntry} from "./IZKSyncSMT.sol";

import "forge-std/console2.sol";

interface IZKSyncDiamond {	
	function storedBatchHash(uint256 batchNumber) external view returns (bytes32);
	function l2LogsRootHash(uint256 batchNumber) external view returns (bytes32);
	function getTotalBatchesExecuted() external view returns (uint256);
}

struct StoredBatchInfo {
	uint64 batchNumber;
	bytes32 batchHash;
	uint64 indexRepeatedStorageChanges;
	uint256 numberOfLayer1Txs;
	bytes32 priorityOperationsHash;
	bytes32 l2LogsTreeRoot;
	uint256 timestamp;
	bytes32 commitment;
}

contract ZKSyncVerifier is IEVMVerifier {

	string[] _gatewayURLs;
	IZKSyncDiamond immutable _diamond;
	IZKSyncSMT immutable _smt;
	uint256 immutable _maxDelay;

	constructor(string[] memory urls, IZKSyncDiamond diamond, IZKSyncSMT smt, uint256 maxDelay) {
		_gatewayURLs = urls;
		_diamond = diamond;
		_smt = smt;
		_maxDelay = maxDelay;
	}

	function gatewayURLs() external view returns (string[] memory) {
		return _gatewayURLs;
	}
	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(getLatestBatchIndex());
	}

	function getLatestBatchIndex() public view returns (uint256) {
		return _diamond.getTotalBatchesExecuted() - 1;
	}

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 latestBatchIndex = abi.decode(context, (uint256));
		(
			bytes memory encodedBatch, 
			bytes[] memory proofs, 
			bytes memory order
		) = abi.decode(proof, (bytes, bytes[], bytes));
		StoredBatchInfo memory batchInfo = abi.decode(encodedBatch, (StoredBatchInfo));
		require(batchInfo.batchNumber <= latestBatchIndex, "ZKS: too new");
		require(batchInfo.batchNumber + _maxDelay >= latestBatchIndex, "ZKS: too old");
		require(keccak256(encodedBatch) == _diamond.storedBatchHash(batchInfo.batchNumber), "ZKS: l1hash");
		require(batchInfo.l2LogsTreeRoot == _diamond.l2LogsRootHash(batchInfo.batchNumber), "ZKS: l2hash");
		return EVMProver.evalRequest(req, ProofSequence(0, batchInfo.batchHash, proofs, order, proveAccountState, proveStorageValue));
	}

	function proveStorageValue(bytes32 root, address target, uint256 slot, bytes memory proof) internal view returns (uint256) {
		return uint256(proveValue(root, target, slot, proof));
	}

	function proveAccountState(bytes32 root, address target, bytes memory proof) internal view returns (bytes32) {
		return proveValue(root, 0x0000000000000000000000000000000000008002, uint160(target), proof) == 0 ? NOT_A_CONTRACT : root;
	}

	function proveValue(bytes32 root, address target, uint256 slot, bytes memory proof) internal view returns (bytes32) {
		uint256 g = gasleft();
		(bytes32 value, uint64 leafIndex, bytes32[] memory path) = abi.decode(proof, (bytes32, uint64, bytes32[]));
		require(root == _smt.getRootHash(path, TreeEntry(slot, value, leafIndex), target), "ZKS: proof");
		console2.log("Gas: %s", g - gasleft());
		return value;
	}

}
