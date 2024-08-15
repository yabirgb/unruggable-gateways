// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../OwnedVerifier.sol";
import {EVMProver, ProofSequence} from "../EVMProver.sol";
import {EthTrieHooks} from "../eth/EthTrieHooks.sol";

interface ITaiko {
	struct Config {
		uint64 chainId;
		uint64 blockMaxProposals;
		uint64 blockRingBufferSize;
		uint64 maxBlocksToVerify;
		uint32 blockMaxGasLimit;
		uint96 livenessBond;
		uint8 stateRootSyncInternal;
		bool checkEOAForCalldataDA;
	}
	struct TransitionState {
		bytes32 key;
		bytes32 blockHash;
		bytes32 stateRoot;
		address prover;
		uint96 validityBond;
		address contester;
		uint96 contestBond;
		uint64 timestamp;
		uint16 tier;
		uint8 __reserved1;
	}
	function getConfig() external view returns (Config memory);
	function getTransition(uint64 blockId, bytes32 parentHash) external view returns (TransitionState memory);
	function getLastSyncedBlock() external view returns (uint64 blockId, bytes32 blockHash, bytes32 stateRoot);
}

contract TaikoVerifier is OwnedVerifier {

	ITaiko immutable _rollup;

	constructor(string[] memory urls, uint256 window, ITaiko rollup) OwnedVerifier(urls, window) {
		_rollup = rollup;
	}

	function getLatestContext() external view returns (bytes memory) {
		(uint64 blockId, , ) = _rollup.getLastSyncedBlock();
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

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint64 latestBlockId = abi.decode(context, (uint64));
		(
			uint64 blockId,
			bytes32 parentHash, 
			bytes[] memory proofs, 
			bytes memory order
		) = abi.decode(proof, (uint64, bytes32, bytes[], bytes));
		_checkWindow(latestBlockId, blockId);
		ITaiko.TransitionState memory ts = _rollup.getTransition(blockId, parentHash); // reverts if invalid
		return EVMProver.evalRequest(req, ProofSequence(0, 
			ts.stateRoot,
			proofs, order,
			EthTrieHooks.proveAccountState,
			EthTrieHooks.proveStorageValue
		));
	}

}
