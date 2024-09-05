// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, StorageSlot} from "../AbstractVerifier.sol";
import {DataRequest, DataProver, ProofSequence} from "../DataProver.sol";
import {EthTrieHooks} from "../eth/EthTrieHooks.sol";
import {ITaiko} from "./ITaiko.sol";

contract TaikoVerifier is AbstractVerifier {

	bytes32 constant SLOT_rollup = keccak256("unruggable.gateway.rollup");

	function _rollup() internal view returns (ITaiko) {
		return ITaiko(StorageSlot.getAddressSlot(SLOT_rollup).value);
	}

	function setRollup(address rollup) external onlyOwner {
		StorageSlot.getAddressSlot(SLOT_rollup).value = rollup;
		emit GatewayChanged();
	}

	function getLatestContext() external view returns (bytes memory) {
		(uint64 blockId, , ) = _rollup().getLastSyncedBlock();
		return abi.encode(blockId);
	}

	// function findDelayedBlockId(uint64 blocks) public view returns (uint64 blockId) {
	// 	(blockId, , ) = _rollup.getLastSyncedBlock();
	// 	uint64 syncInterval = _rollup.getConfig().stateRootSyncInternal;
	// 	// https://github.com/taikoxyz/taiko-mono/blob/main/packages/protocol/contracts/L1/libs/LibUtils.sol
	// 	uint64 shim = 1; // shouldSyncStateRoot() on last
	// 	require(blockId % syncInterval == syncInterval - shim, "block not aligned"); // guarenteed by protocol
	// 	require(_commitStep % syncInterval == 0, "step not aligned"); // expected gateway parameter
	// 	blockId -= (blocks * 3 / 2); // based rollup so 1 block every 1-2 blocks
	// 	blockId -= (blockId + shim) % _commitStep; // realign
	// 	// example: blockId = 95, sync = 16, delay = 3, step = 32 (16x2)
	// 	// 95 % 16 == 16 - 1 == 15
	// 	// 95 - (3 * 3 / 2) = 95 - 4 = 91
	// 	// 91 - (92 % 32) = 91 - 28 = 63
	// 	// 63 % 16 == 15
	// }

	function getStorageValues(bytes memory context, DataRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint64 blockId1 = abi.decode(context, (uint64));
		(
			uint64 blockId,
			bytes32 parentHash,
			bytes[] memory proofs,
			bytes memory order
		) = abi.decode(proof, (uint64, bytes32, bytes[], bytes));
		_checkWindow(blockId1, blockId);
		ITaiko.TransitionState memory ts = _rollup().getTransition(blockId, parentHash); // reverts if invalid
		return DataProver.evalRequest(req, ProofSequence(0, 
			ts.stateRoot,
			proofs, order,
			EthTrieHooks.proveAccountState,
			EthTrieHooks.proveStorageValue
		));
	}

}
