import { Interface } from 'ethers';
import type { HexString32 } from '../types.js';

export const ORACLE_ABI = new Interface([
  'function latestOutputIndex() external view returns (uint256)',
  `function getL2Output(uint256 outputIndex) external view returns (tuple(
	  bytes32 outputRoot, 
	  uint128 timestamp, 
	  uint128 l2BlockNumber
	))`,
]);

export type ABIOutputProposal = {
  outputRoot: HexString32;
  timestamp: bigint;
  l2BlockNumber: bigint;
};

export const PORTAL_ABI = new Interface([
  `function disputeGameFactory() view returns (address)`,
  `function respectedGameType() view returns (uint32)`,
]);

export const GAME_FINDER_ABI = new Interface([
  `function findFinalizedGameIndex(address portal, uint256 gameTypes, uint256 gameCount) external view returns (uint256)`,
  `function getFinalizedGame(address portal, uint256 gameTypes, uint256 gameIndex) external view returns (uint256 gameType, address gameProxy, uint256 l2BlockNumber)`,
]);

export const L1_BLOCK_ABI = new Interface([
  `function number() view returns (uint256)`,
  //`function hash() view returns (bytes32)`,
]);
