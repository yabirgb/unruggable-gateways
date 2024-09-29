import { Interface } from 'ethers/abi';
import type { HexString32 } from '../types.js';

// https://github.com/taikoxyz/taiko-mono/blob/main/packages/protocol/contracts/L1/TaikoL1.sol
export const TAIKO_ABI = new Interface([
  `function getLastSyncedBlock() view returns (uint64 blockId, bytes32 blockHash, bytes32 stateRoot)`, //, uint64 verifiedAt
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

export type ABITaikoConfig = {
  stateRootSyncInternal: bigint;
  maxBlocksToVerify: bigint;
};

export type ABITaikoLastSyncedBlock = {
  blockId: bigint;
  blockHash: HexString32;
  stateRoot: HexString32;
};
