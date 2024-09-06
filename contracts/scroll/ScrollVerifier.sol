// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, StorageSlot} from "../AbstractVerifier.sol";
import {GatewayRequest, GatewayProver, ProofSequence} from "../GatewayProver.sol";
import {ScrollTrieHooks, IPoseidon} from "./ScrollTrieHooks.sol";

interface IScrollChain {
	function lastFinalizedBatchIndex() external view returns (uint256);
	function finalizedStateRoots(uint256 batchIndex) external view returns (bytes32);
}

interface IScrollChainCommitmentVerifier {
	function rollup() external view returns (IScrollChain);
	function poseidon() external view returns (IPoseidon);
}

contract ScrollVerifier is AbstractVerifier {

	bytes32 constant SLOT_commitmentVerifier = keccak256("unruggable.gateway.commitmentVerifier");

	function _commitmentVerifier() internal view returns (IScrollChainCommitmentVerifier) {
		return IScrollChainCommitmentVerifier(StorageSlot.getAddressSlot(SLOT_commitmentVerifier).value);
	}

	function setCommitmentVerifier(address commitmentVerifier) external onlyOwner {
		StorageSlot.getAddressSlot(SLOT_commitmentVerifier).value = commitmentVerifier;
		emit GatewayChanged();
	}

	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(_commitmentVerifier().rollup().lastFinalizedBatchIndex());
	}

	function getStorageValues(bytes memory context, GatewayRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 batchIndex1 = abi.decode(context, (uint256));
		(
			uint256 batchIndex,
			bytes[] memory proofs, 
			bytes memory order
		) = abi.decode(proof, (uint256, bytes[], bytes));
		_checkWindow(batchIndex1, batchIndex);
		bytes32 stateRoot = _commitmentVerifier().rollup().finalizedStateRoots(batchIndex);
		require(stateRoot != bytes32(0), "Scroll: not finalized");
		return GatewayProver.evalRequest(req, ProofSequence(0,
			stateRoot,
			proofs, order,
			proveAccountState,
			proveStorageValue
		));
	}

	function proveAccountState(bytes32 stateRoot, address target, bytes memory proof) internal view returns (bytes32) {
		return ScrollTrieHooks.proveAccountState(_commitmentVerifier().poseidon(), stateRoot, target, abi.decode(proof, (bytes[])));
	}

	function proveStorageValue(bytes32 storageRoot, address, uint256 slot, bytes memory proof) internal view returns (bytes32) {
		return ScrollTrieHooks.proveStorageValue(_commitmentVerifier().poseidon(), storageRoot, slot, abi.decode(proof, (bytes[])));
	}

}
