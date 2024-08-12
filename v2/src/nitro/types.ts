import { ethers } from 'ethers';

export const ROLLUP_ABI = new ethers.Interface([
  'function latestConfirmed() external view returns (uint64)',
  'function latestNodeCreated() external view returns (uint64)',
  `event NodeCreated(
	  uint64 indexed nodeNum,
	  bytes32 indexed parentNodeHash,
	  bytes32 indexed nodeHash,
	  bytes32 executionHash,
	  tuple(
	  tuple(tuple(bytes32[2] bytes32Vals, uint64[2] u64Vals) globalState, uint8 machineStatus) beforeState,
	  tuple(tuple(bytes32[2] bytes32Vals, uint64[2] u64Vals) globalState, uint8 machineStatus) afterState,
	  uint64 numBlocks
	  ) assertion,
	  bytes32 afterInboxBatchAcc,
	  bytes32 wasmModuleRoot,
	  uint256 inboxMaxCount
	)`,
]);
