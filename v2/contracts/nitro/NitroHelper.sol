// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Node, IRollupCore} from "@arbitrum/nitro-contracts/src/rollup/IRollupCore.sol";

contract NitroHelper {

	// function findDelayedNodeNum(IRollupCore rollup, uint256 delaySec) public view returns (uint64 nodeNum) {
	// 	uint256 delayed = block.number - delaySec;
	// 	uint64 nodeNum = _rollup.latestConfirmed();
	// 	while (true) {
	// 	for (nodeNum = _rollup.latestConfirmed(); nodeNum > 0; --nodeNum) {
	// 		if (_rollup.getNode(nodeNum).createdAtBlock <= delayed) {
	// 			break;
	// 		}
	// 		require(nodeNum > 0);
	// 	}
	// }

}
