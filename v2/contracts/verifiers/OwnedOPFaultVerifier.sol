// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../EVMProtocol.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IEVMVerifier} from "../IEVMVerifier.sol";
import {EVMProver, ProofSequence} from "../EVMProver.sol";
import {MerkleTrieHelper} from "../MerkleTrieHelper.sol";

import {Hashing, Types} from "@eth-optimism/contracts-bedrock/src/libraries/Hashing.sol";
import "@eth-optimism/contracts-bedrock/src/dispute/interfaces/IDisputeGameFactory.sol";

interface IOptimismPortal {
	function disputeGameFactory() external view returns (IDisputeGameFactory);
	function respectedGameType() external view returns (GameType);
}

contract OwnedOPFaultVerifier is IEVMVerifier, Ownable {

	event GatewayConfigChanged(string[] urls, uint256 delay);

	string[] _gatewayURLs;
	IOptimismPortal immutable _portal;
	uint256 _blockDelay;

	constructor(string[] memory urls, IOptimismPortal portal, uint256 blockDelay) Ownable(msg.sender) {
		_portal = portal;
		setGatewayConfig(urls, blockDelay);
	}

	function setGatewayConfig(string[] memory urls, uint256 blockDelay) onlyOwner public {
		_gatewayURLs = urls;
		_blockDelay = blockDelay;
		emit GatewayConfigChanged(urls, blockDelay);
	}

	function gatewayURLs() external view returns (string[] memory) {
		return _gatewayURLs;
	}
	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(findDelayedGameIndex(_blockDelay));
	}

	function findDelayedGameIndex(uint256 blocks) public view returns (uint256 gameIndex) {
		uint256 delayedTime = block.timestamp - 12 * blocks; // seconds
		IDisputeGameFactory factory = _portal.disputeGameFactory();
		uint32 rgt = _portal.respectedGameType().raw();
		gameIndex = factory.gameCount();
		while (gameIndex > 0) {
			(
				GameType gameType, 
				Timestamp timestamp, 
				IDisputeGame gameProxy
			) = _portal.disputeGameFactory().gameAtIndex(--gameIndex);
			if (gameType.raw() == rgt && timestamp.raw() <= delayedTime && gameProxy.status() != GameStatus.CHALLENGER_WINS) {
				break;
			}
		}
	}

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 gameIndex = abi.decode(context, (uint256));
		(
			Types.OutputRootProof memory outputRootProof, 
			bytes[] memory proofs,
			bytes memory order
		) = abi.decode(proof, (Types.OutputRootProof, bytes[], bytes));
		(, , IDisputeGame gameProxy) = _portal.disputeGameFactory().gameAtIndex(gameIndex);
		bytes32 outputRoot = gameProxy.rootClaim().raw();
		bytes32 expectedRoot = Hashing.hashOutputRootProof(outputRootProof);
		if (outputRoot != expectedRoot) {
			revert VerifierMismatch(context, expectedRoot, outputRoot);
		}
		return EVMProver.evalRequest(req, ProofSequence(0, outputRootProof.stateRoot, proofs, order, MerkleTrieHelper.proveAccountState, MerkleTrieHelper.proveStorageValue));
	}

}
