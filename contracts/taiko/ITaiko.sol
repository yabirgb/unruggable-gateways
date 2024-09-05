// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

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
