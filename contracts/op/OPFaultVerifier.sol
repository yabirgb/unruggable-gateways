// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../OwnedVerifier.sol";
import {DataProver, ProofSequence} from "../DataProver.sol";
import {EthTrieHooks} from "../eth/EthTrieHooks.sol";
import {Hashing, Types} from "@eth-optimism/contracts-bedrock/src/libraries/Hashing.sol";

interface IOptimismPortal {
	function disputeGameFactory() external view returns (IDisputeGameFactory);
	function respectedGameType() external view returns (GameType);
	// we don't care if the root was blacklisted, this only applies to withdrawals
	//function disputeGameBlacklist(IDisputeGame game) external view returns (bool);
}

interface IOPFaultGameFinder {
	function findFinalizedGameIndex(IOptimismPortal portal, uint256 gameTypes, uint256 gameCount) external view returns (uint256);
}

//We define inline the interfaces, types, and enumerations that we need to avoid OP remapped src paths issue
//From v2/lib/optimism/packages/contracts-bedrock/src/dispute/interfaces/IDisputeGameFactory.sol
interface IDisputeGameFactory {
	function gameAtIndex(uint256 _index) external view returns (GameType gameType_, Timestamp timestamp_, IDisputeGame proxy_);
}

//From v2/lib/optimism/packages/contracts-bedrock/src/dispute/interfaces/IDisputeGame.sol
interface IDisputeGame {
    function resolvedAt() external view returns (Timestamp resolvedAt_);
    function status() external view returns (GameStatus status_);
    function rootClaim() external pure returns (Claim rootClaim_);
}

//From v2/lib/optimism/packages/contracts-bedrock/src/dispute/lib/Types.sol
enum GameStatus {
    IN_PROGRESS,
    CHALLENGER_WINS,
    DEFENDER_WINS
}

//From v2/lib/optimism/packages/contracts-bedrock/src/dispute/lib/LibUDT.sol
type GameType is uint32;
type Timestamp is uint64;
type Claim is bytes32;
type Hash is bytes32;

//From v2/lib/optimism/packages/contracts-bedrock/src/dispute/lib/LibPosition.sol
type Position is uint128;

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

	function getStorageValues(bytes memory context, DataRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
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
			_checkWindow(Timestamp.unwrap(gameProxy1.resolvedAt()), Timestamp.unwrap(gameProxy.resolvedAt()));
			// check if game is finalized
			//(, , uint256 blockNumber) = _gameFinder.getFinalizedGame(_portal, _gameTypes, gameIndex);
			//require(blockNumber != 0, "OPFault: not finalized");
			uint256 gameTypes = _gameTypes;
			if (gameTypes == 0) gameTypes = 1 << GameType.unwrap(_portal.respectedGameType());
			require((gameTypes & (1 << GameType.unwrap(gt))) != 0, "OPFault: unsupported gameType");
			require(gameProxy.status() == GameStatus.DEFENDER_WINS, "OPFault: not finalized");
		}
		require(Claim.unwrap(gameProxy.rootClaim()) == Hashing.hashOutputRootProof(outputRootProof), "OPFault: invalid root");
		return DataProver.evalRequest(req, ProofSequence(0,
			outputRootProof.stateRoot,
			proofs, order,
			EthTrieHooks.proveAccountState,
			EthTrieHooks.proveStorageValue
		));
	}

}
