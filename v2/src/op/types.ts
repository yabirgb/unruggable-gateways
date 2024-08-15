import { ethers } from 'ethers';
import type { HexString32 } from '../types.js';

export const ORACLE_ABI = new ethers.Interface([
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

export const DEFENDER_WINS = 2n;

export const PORTAL_ABI = new ethers.Interface([
  `function disputeGameFactory() view returns (address)`,
  `function respectedGameType() view returns (uint32)`,
]);

export const HELPER_ABI = new ethers.Interface([
  'function findDelayedGameIndex(address portal, uint256 delaySec) view returns (uint256)',
]);

export const GAME_ABI = new ethers.Interface([
  'function l2BlockNumber() external view returns (uint256)',
  'function status() external view returns (uint8)',
  'function rootClaim() external view returns (bytes32)',
  'function startingRootHash() external view returns (bytes32)',
]);

export const FACTORY_ABI = new ethers.Interface([
  `function gameAtIndex(uint256 _index) external view returns (uint32 gameType, uint64 timestamp, address gameProxy)`,
  `function gameCount() external view returns (uint256 gameCount_)`,
  `function findLatestGames(uint32 gameType, uint256 _start, uint256 _n) external view returns (tuple(uint256 index, bytes32 metadata, uint64 timestamp, bytes32 rootClaim, bytes extraData)[] memory games_)`,
  `function gameImpls(uint32 gameType) view returns (address)`,
]);

export const FAULT_GAME_ABI = new ethers.Interface([
  `function anchorStateRegistry() view returns (address)`,
]);

export const ANCHOR_REGISTRY_ABI = new ethers.Interface([
  `function anchors(uint32 gameType) view returns (bytes32 rootClaim, uint256 l2BlockNumber)`,
]);
