// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IRootChainProxy {
	function currentHeaderBlock() external view returns (uint256);
	function getLastChildBlock() external view returns (uint256);
	function headerBlocks(uint256) external view returns (bytes32 root, uint256 start, uint256 end, uint256 createdAt, address proposer);
}
