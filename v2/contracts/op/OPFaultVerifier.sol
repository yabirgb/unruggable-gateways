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
}

interface IOPFaultHelper {
	function findDelayedGameIndex(IOptimismPortal portal, uint256 delaySec) external view returns (uint256);
}

contract OPFaultVerifier is OwnedVerifier {

	IOptimismPortal immutable _portal;
	IOPFaultHelper immutable _helper;

	constructor(string[] memory urls, uint256 window, IOptimismPortal portal, IOPFaultHelper helper) OwnedVerifier(urls, window) {
		_portal = portal;
		_helper = helper;
	}

	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(_helper.findDelayedGameIndex(_portal, 0));
	}

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 gameIndex1 = abi.decode(context, (uint256));
		(
			uint256 gameIndex,
			Types.OutputRootProof memory outputRootProof, 
			bytes[] memory proofs,
			bytes memory order
		) = abi.decode(proof, (uint256, Types.OutputRootProof, bytes[], bytes));
		//_checkWindow(gameIndex1, gameIndex);
		IDisputeGameFactory factory = _portal.disputeGameFactory();
		(, , IDisputeGame gameProxy) = factory.gameAtIndex(gameIndex);
		(, , IDisputeGame gameProxy1) = factory.gameAtIndex(gameIndex1);
		_checkWindow(gameProxy1.resolvedAt().raw(), gameProxy.resolvedAt().raw());
		bytes32 outputRoot = gameProxy.rootClaim().raw();
		bytes32 computedRoot = Hashing.hashOutputRootProof(outputRootProof);
		require(outputRoot == computedRoot, "OPFault: invalid root");
		require(gameProxy.status() == GameStatus.DEFENDER_WINS, "OPFault: not finalized");
		return EVMProver.evalRequest(req, ProofSequence(0,
			outputRootProof.stateRoot,
			proofs, order,
			EthTrieHooks.proveAccountState,
			EthTrieHooks.proveStorageValue
		));
	}

}
