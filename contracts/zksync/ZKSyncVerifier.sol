// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, StorageSlot} from "../AbstractVerifier.sol";
import {GatewayRequest, GatewayProver, ProofSequence, NOT_A_CONTRACT} from "../GatewayProver.sol";
import {IZKSyncSMT, TreeEntry, ACCOUNT_CODE_HASH} from "./IZKSyncSMT.sol";

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

contract ZKSyncVerifier is AbstractVerifier {

	IZKSyncSMT immutable _smt;

	constructor(IZKSyncSMT smt) {
		_smt = smt;
	}

	bytes32 constant SLOT_diamond = keccak256("unruggable.gateway.diamond");

	function _diamond() internal view returns (IZKSyncDiamond) {
		return IZKSyncDiamond(StorageSlot.getAddressSlot(SLOT_diamond).value);
	}

	function setDiamond(address diamond) external onlyOwner {
		StorageSlot.getAddressSlot(SLOT_diamond).value = diamond;
		emit GatewayChanged();
	}

	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(_diamond().getTotalBatchesExecuted() - 1);
	}

	function getStorageValues(bytes memory context, GatewayRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 batchIndex1 = abi.decode(context, (uint256));
		(
			bytes memory encodedBatch,
			bytes[] memory proofs,
			bytes memory order
		) = abi.decode(proof, (bytes, bytes[], bytes));
		StoredBatchInfo memory batchInfo = abi.decode(encodedBatch, (StoredBatchInfo));
		_checkWindow(batchIndex1, batchInfo.batchNumber);
		IZKSyncDiamond diamond = _diamond();
		require(keccak256(encodedBatch) == diamond.storedBatchHash(batchInfo.batchNumber), "ZKS: batchHash");
		require(batchInfo.l2LogsTreeRoot == diamond.l2LogsRootHash(batchInfo.batchNumber), "ZKS: l2LogsRootHash");
		return GatewayProver.evalRequest(req, ProofSequence(0,
			batchInfo.batchHash,
			proofs, order,
			proveAccountState,
			proveStorageValue
		));
	}

	function proveStorageValue(bytes32 root, address target, uint256 slot, bytes memory proof) internal view returns (bytes32) {
		return _proveValue(root, target, slot, proof);
	}

	function proveAccountState(bytes32 root, address target, bytes memory proof) internal view returns (bytes32) {
		// when no account proof is provided, we assume the target is a contract
		// this is safe because zksync uses a single trie and there is no storage root
		return proof.length > 0 && _proveValue(root, ACCOUNT_CODE_HASH, uint160(target), proof) == 0 ? NOT_A_CONTRACT : root;
	}

	// TODO: should this be moved to an external library?
	function _proveValue(bytes32 root, address target, uint256 slot, bytes memory proof) internal view returns (bytes32) {
		(bytes32 value, uint64 leafIndex, bytes32[] memory path) = abi.decode(proof, (bytes32, uint64, bytes32[]));
		require(root == _smt.getRootHash(path, TreeEntry(slot, value, leafIndex), target), "ZKS: proof");
		return value;
	}

}
