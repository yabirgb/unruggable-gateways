// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {AbstractVerifier, StorageSlot} from "../AbstractVerifier.sol";
import {DataRequest, DataProver, ProofSequence} from "../DataProver.sol";
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

contract OPFaultVerifier is AbstractVerifier {

	IOPFaultGameFinder immutable _gameFinder;

	constructor(IOPFaultGameFinder gameFinder) {
		_gameFinder = gameFinder;
	}

	bytes32 constant SLOT_portal = keccak256("unruggable.gateway.portal");
	bytes32 constant SLOT_gameTypes = keccak256("unruggable.gateway.gameTypes");

	function _portal() internal view returns (IOptimismPortal) {
		return IOptimismPortal(StorageSlot.getAddressSlot(SLOT_portal).value);
	}
	function _gameTypes() internal view returns (uint256 ret) {
		return StorageSlot.getUint256Slot(SLOT_gameTypes).value;
	}

	function setPortal(address portal) external onlyOwner {
		StorageSlot.getAddressSlot(SLOT_portal).value = portal;
		emit GatewayChanged();
	}
	function setGameTypes(uint256 gameTypes) external onlyOwner {
		StorageSlot.getUint256Slot(SLOT_gameTypes).value = gameTypes;
		emit GatewayChanged();
	}

	function getLatestContext() external virtual view returns (bytes memory) {
		return abi.encode(_gameFinder.findFinalizedGameIndex(_portal(), _gameTypes(), 0));
	}

	function getStorageValues(bytes memory context, DataRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 gameIndex1 = abi.decode(context, (uint256));
		(
			uint256 gameIndex,
			Types.OutputRootProof memory outputRootProof, 
			bytes[] memory proofs,
			bytes memory order
		) = abi.decode(proof, (uint256, Types.OutputRootProof, bytes[], bytes));
		IOptimismPortal portal = _portal();
		IDisputeGameFactory factory = portal.disputeGameFactory();
		(GameType gt, , IDisputeGame gameProxy) = factory.gameAtIndex(gameIndex);
		if (gameIndex != gameIndex1) {
			// the gateway gave us a different game, so lets check it
			(, , IDisputeGame gameProxy1) = factory.gameAtIndex(gameIndex1);
			// check if game is within our window
			_checkWindow(Timestamp.unwrap(gameProxy1.resolvedAt()), Timestamp.unwrap(gameProxy.resolvedAt()));
			// check if game is finalized
			uint256 gameTypes = _gameTypes();
			if (gameTypes == 0) gameTypes = 1 << GameType.unwrap(portal.respectedGameType());
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
