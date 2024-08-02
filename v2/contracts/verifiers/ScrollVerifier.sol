// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../EVMProtocol.sol";
import {IEVMVerifier} from "../IEVMVerifier.sol";
import {EVMProver, ProofSequence} from "../EVMProver.sol";
import {ScrollTrieHelper, IPoseidon} from "../ScrollTrieHelper.sol";

interface IScrollChain {
	function lastFinalizedBatchIndex() external view returns (uint256);
	function finalizedStateRoots(uint256 batchIndex) external view returns (bytes32);
}

interface IScrollChainCommitmentVerifier {
	function rollup() external view returns (IScrollChain);
	function poseidon() external view returns (IPoseidon);
}

contract ScrollVerifier is IEVMVerifier {

	string[] _gatewayURLs;
	IScrollChainCommitmentVerifier immutable _commitmentVerifier;
	uint256 immutable _commitDelay;
	uint256 immutable _commitStep;

	constructor(string[] memory urls, IScrollChainCommitmentVerifier commitmentVerifier, uint256 commitDelay, uint256 step) {
		_gatewayURLs = urls;
		_commitmentVerifier = commitmentVerifier;
		_commitDelay = commitDelay; // this is COMMITS not BLOCKS
		_commitStep = step;
	}

	function gatewayURLs() external view returns (string[] memory) {
		return _gatewayURLs;
	}
	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(findDelayedBatchIndex(_commitDelay));
	}

	function findDelayedBatchIndex(uint256 commits) public view returns (uint256 batchIndex) {
		batchIndex = _commitmentVerifier.rollup().lastFinalizedBatchIndex() - commits;
		batchIndex -= (batchIndex % _commitStep);
	}

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 index = abi.decode(context, (uint256));
		(bytes[] memory proofs, bytes memory order) = abi.decode(proof, (bytes[], bytes));
		bytes32 stateRoot = _commitmentVerifier.rollup().finalizedStateRoots(index);
		return EVMProver.evalRequest(req, ProofSequence(0, stateRoot, proofs, order, proveAccountState, proveStorageValue));
	}

	function proveStorageValue(bytes32 storageRoot, address, uint256 slot, bytes memory proof) internal view returns (uint256) {
		return uint256(ScrollTrieHelper.proveStorageValue(_commitmentVerifier.poseidon(), storageRoot, slot, abi.decode(proof, (bytes[]))));
	}

	function proveAccountState(bytes32 stateRoot, address target, bytes memory proof) internal view returns (bytes32) {
		return ScrollTrieHelper.proveAccountState(_commitmentVerifier.poseidon(), stateRoot, target, abi.decode(proof, (bytes[])));
	}

}
