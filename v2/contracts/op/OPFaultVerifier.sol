// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../OwnedVerifier.sol";
import {EVMProver, ProofSequence} from "../EVMProver.sol";
import {EthTrieHooks} from "../eth/EthTrieHooks.sol";
import {Hashing, Types} from "@eth-optimism/contracts-bedrock/src/libraries/Hashing.sol";
import "@eth-optimism/contracts-bedrock/src/dispute/interfaces/IDisputeGameFactory.sol";
import {IFaultDisputeGame} from "@eth-optimism/contracts-bedrock/src/dispute/interfaces/IFaultDisputeGame.sol";
import {IAnchorStateRegistry} from "@eth-optimism/contracts-bedrock/src/dispute/interfaces/IAnchorStateRegistry.sol";

interface IOptimismPortal {
	function disputeGameFactory() external view returns (IDisputeGameFactory);
	function respectedGameType() external view returns (GameType);
	// we don't care if the root was blacklisted, this only applies to withdrawals
	//function disputeGameBlacklist(IDisputeGame game) external view returns (bool);
}

// interface IOPFaultHelper {
// 	function findDelayedGameIndex(IOptimismPortal portal, uint256 delaySec) external view returns (uint256);
// }

// interface IFaultDisputeGameStub {
// 	function anchorStateRegistry() external view returns (IAnchorStateRegistry);
// }

contract OPFaultVerifier is OwnedVerifier {

	IOptimismPortal immutable _portal;
	//IOPFaultHelper immutable _helper;
	uint256 _gameTypes;

	constructor(string[] memory urls, uint256 window, IOptimismPortal portal, uint256 gameTypes) OwnedVerifier(urls, window) {
		_portal = portal;
		_gameTypes = gameTypes;
	}

	function setGameTypes(uint256 gameTypes) external onlyOwner {
		_gameTypes = gameTypes;
		emit GatewayChanged();
	}

	function _isSupportedGameType(GameType gt) internal view returns (bool) {
		return (_gameTypes & (1 << gt.raw())) != 0;
	}

	function getLatestContext() external virtual view returns (bytes memory) {
		IDisputeGameFactory factory = _portal.disputeGameFactory();
		uint256 i = factory.gameCount();
		while (i > 0) {
			(GameType gt, , IDisputeGame proxy) = factory.gameAtIndex(--i);
			if (_isSupportedGameType(gt) && proxy.status() == GameStatus.DEFENDER_WINS) {
				return abi.encode(i);
			}
		}
		revert("no game");
	}

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 gameIndex1 = abi.decode(context, (uint256));
		(
			uint256 gameIndex,
			Types.OutputRootProof memory outputRootProof, 
			bytes[] memory proofs,
			bytes memory order
		) = abi.decode(proof, (uint256, Types.OutputRootProof, bytes[], bytes));
		IDisputeGameFactory factory = _portal.disputeGameFactory();
		(GameType gt, , IDisputeGame gameProxy) = factory.gameAtIndex(gameIndex);
		if (gameIndex != gameIndex1) {
			(, , IDisputeGame gameProxy1) = factory.gameAtIndex(gameIndex1);
			_checkWindow(gameProxy1.resolvedAt().raw(), gameProxy.resolvedAt().raw());
		}
		require(_isSupportedGameType(gt), "OPFault: gameType");
		require(gameProxy.status() == GameStatus.DEFENDER_WINS, "OPFault: status");
		require(gameProxy.rootClaim().raw() == Hashing.hashOutputRootProof(outputRootProof), "OPFault: root");
		return EVMProver.evalRequest(req, ProofSequence(0,
			outputRootProof.stateRoot,
			proofs, order,
			EthTrieHooks.proveAccountState,
			EthTrieHooks.proveStorageValue
		));
	}

}
