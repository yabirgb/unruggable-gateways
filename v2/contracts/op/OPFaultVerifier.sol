// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../OwnedVerifier.sol";
import {EVMProver, ProofSequence} from "../EVMProver.sol";
import {EthTrieHooks} from "../eth/EthTrieHooks.sol";
import {Hashing, Types} from "@eth-optimism/contracts-bedrock/src/libraries/Hashing.sol";
import "@eth-optimism/contracts-bedrock/src/dispute/interfaces/IDisputeGameFactory.sol";

interface IOptimismPortal {
	function disputeGameFactory() external view returns (IDisputeGameFactory);
	function respectedGameType() external view returns (GameType);
	// we don't care if the root was blacklisted, this only applies to withdrawals
	//function disputeGameBlacklist(IDisputeGame game) external view returns (bool);
}

interface IOPFaultGameFinder {
	function findFinalizedGameIndex(IOptimismPortal portal, uint256 gameTypes, uint256 gameCount) external view returns (uint256);
}

contract OPFaultVerifier is OwnedVerifier {

	IOptimismPortal immutable _portal;
	IOPFaultGameFinder immutable _gameFinder;
	uint256 _gameTypes;

	constructor(string[] memory urls, uint256 window, IOptimismPortal portal, IOPFaultGameFinder gameFinder, uint256 gameTypes) OwnedVerifier(urls, window) {
		_portal = portal;
		_gameFinder = gameFinder;
		_gameTypes = gameTypes;
	}

	function setGameTypes(uint256 gameTypes) external onlyOwner {
		_gameTypes = gameTypes;
		emit GatewayChanged();
	}

	function getLatestContext() external virtual view returns (bytes memory) {
		return abi.encode(_gameFinder.findFinalizedGameIndex(_portal, _gameTypes, 0));
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
			// the gateway gave us a different game, so lets check it
			(, , IDisputeGame gameProxy1) = factory.gameAtIndex(gameIndex1);
			// check if game is within our window
			_checkWindow(gameProxy1.resolvedAt().raw(), gameProxy.resolvedAt().raw());
			// check if game is finalized
			//(, , uint256 blockNumber) = _gameFinder.getFinalizedGame(_portal, _gameTypes, gameIndex);
			//require(blockNumber != 0, "OPFault: not finalized");
			uint256 gameTypes = _gameTypes;
			if (gameTypes == 0) gameTypes = 1 << _portal.respectedGameType().raw();
			require((gameTypes & (1 << gt.raw())) != 0, "OPFault: unsupported gameType");
			require(gameProxy.status() == GameStatus.DEFENDER_WINS, "OPFault: not finalized");
		}
		require(gameProxy.rootClaim().raw() == Hashing.hashOutputRootProof(outputRootProof), "OPFault: invalid root");
		return EVMProver.evalRequest(req, ProofSequence(0,
			outputRootProof.stateRoot,
			proofs, order,
			EthTrieHooks.proveAccountState,
			EthTrieHooks.proveStorageValue
		));
	}

}
