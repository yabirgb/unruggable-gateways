// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IDisputeGame, GameType, GameStatus} from "@eth-optimism/contracts-bedrock/src/dispute/interfaces/IDisputeGame.sol";
import {IDisputeGameFactory} from "@eth-optimism/contracts-bedrock/src/dispute/interfaces/IDisputeGameFactory.sol";

interface IOptimismPortal {
	function disputeGameFactory() external view returns (IDisputeGameFactory);
	function respectedGameType() external view returns (GameType);
}

contract OPFaultHelper {

	// https://github.com/ethereum-optimism/optimism/issues/11269
	function findDelayedGameIndex(IOptimismPortal portal, uint256 delaySec) external view returns (uint256) {
		uint256 t1 = block.timestamp - delaySec;
		GameType rgt = portal.respectedGameType();
		IDisputeGameFactory factory = portal.disputeGameFactory();
		uint256 i = factory.gameCount();
		while (i > 0) {
			(GameType gt, , IDisputeGame proxy) = factory.gameAtIndex(--i);
			if (gt.raw() != rgt.raw()) continue; // wrong type
			if (proxy.status() != GameStatus.DEFENDER_WINS) continue; // not resolved
			if (proxy.resolvedAt().raw() > t1) continue; // not visible
			return i;
		}
		revert();
	}

}
