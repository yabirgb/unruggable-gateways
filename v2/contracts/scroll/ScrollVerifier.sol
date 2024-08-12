// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../OwnedVerifier.sol";
import {EVMProver, ProofSequence} from "../EVMProver.sol";
import {ScrollTrieHelper, IPoseidon} from "./ScrollTrieHelper.sol";

interface IScrollChain {
	function lastFinalizedBatchIndex() external view returns (uint256);
	function finalizedStateRoots(uint256 batchIndex) external view returns (bytes32);
}

interface IScrollChainCommitmentVerifier {
	function rollup() external view returns (IScrollChain);
	function poseidon() external view returns (IPoseidon);
}

contract ScrollVerifier is OwnedVerifier {

	IScrollChainCommitmentVerifier immutable _commitmentVerifier;

	constructor(string[] memory urls, uint256 window, IScrollChainCommitmentVerifier commitmentVerifier) OwnedVerifier(urls, window) {
		_commitmentVerifier = commitmentVerifier;
	}

	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(_commitmentVerifier.rollup().lastFinalizedBatchIndex());
	}

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 latestBatchIndex = abi.decode(context, (uint256));
		(
			uint256 batchIndex,
			bytes[] memory proofs, 
			bytes memory order
		) = abi.decode(proof, (uint256, bytes[], bytes));
		_checkWindow(latestBatchIndex, batchIndex);
		bytes32 stateRoot = _commitmentVerifier.rollup().finalizedStateRoots(batchIndex);
		return EVMProver.evalRequest(req, ProofSequence(0, stateRoot, proofs, order, proveAccountState, proveStorageValue));
	}

	function proveStorageValue(bytes32 storageRoot, address, uint256 slot, bytes memory proof) internal view returns (uint256) {
		return uint256(ScrollTrieHelper.proveStorageValue(_commitmentVerifier.poseidon(), storageRoot, slot, abi.decode(proof, (bytes[]))));
	}

	function proveAccountState(bytes32 stateRoot, address target, bytes memory proof) internal view returns (bytes32) {
		return ScrollTrieHelper.proveAccountState(_commitmentVerifier.poseidon(), stateRoot, target, abi.decode(proof, (bytes[])));
	}

}
