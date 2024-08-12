import { ethers } from 'ethers';

export const TAIKO_ABI = new ethers.Interface([
  'function getLastSyncedBlock() view returns (uint64 blockId, bytes32 blockHash, bytes32 stateRoot)',
  'function getLastVerifiedBlock() view returns (uint64 blockId, bytes32 blockHash, bytes32 stateRoot)',
  `function getConfig() view returns (tuple(
     uint64 chainId,
     uint64 blockMaxProposals,
     uint64 blockRingBufferSize,
     uint64 maxBlocksToVerify,
     uint32 blockMaxGasLimit,
     uint96 livenessBond,
     uint8 stateRootSyncInternal,
     bool checkEOAForCalldataDA
  ))`,
]);
