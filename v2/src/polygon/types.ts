import { Interface } from 'ethers';
import type { HexString32 } from '../types';

export const ROOT_CHAIN_ABI = new Interface([
  //   `event NewHeaderBlock(
  //      address indexed proposer,
  // 	 uint256 indexed blockId,
  // 	 uint256 indexed reward,
  // 	 uint256 start,
  // 	 uint256 end,
  // 	 bytes32 root
  //   )`,
  `function currentHeaderBlock() view returns (uint256)`,
  `function getLastChildBlock() view returns (uint256)`,
  `function headerBlocks(uint256) view returns (bytes32 rootHash, uint256 l2BlockNumberStart, uint256 l2BlockNumberEnd, uint256 createdAt, address proposer)`,
]);

export type ABIHeaderTuple = {
  readonly rootHash: HexString32;
  readonly l2BlockNumberStart: bigint;
  readonly l2BlockNumberEnd: bigint;
};

// https://polygonscan.com/tx/0xff88715030e2a7332586df92bf77477ae6f989029017fcfd82d01f38c45ff70e#eventlog
// export const POSTER_ABI = new Interface([
//   `event NewRoot(bytes32 indexed prevBlockHash)`,
// ]);
