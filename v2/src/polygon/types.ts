import { Interface } from 'ethers';

// 0x86E4Dc95c7FBdBf52e33D563BbDB00823894C287
export const ROOT_CHAIN_PROXY_ABI = new Interface([
  `event NewHeaderBlock(
     indexed address proposer,
	 indexed uint256 blockId, 
	 indexed uint256 reward, 
	 uint256 start, 
	 uint256 end, 
	 bytes32 root
  )`,
  `function currentHeaderBlock() view returns (uint256)`,
  `function getLastChildBlock() view returns (uint256)`,
  `function headerBlocks(uint256) view returns (bytes32 root, uint256 start, uint256 end, uint256 createdAt, address proposer)`,
]);
