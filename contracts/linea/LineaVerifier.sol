// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, StorageSlot} from "../AbstractVerifier.sol";
import {GatewayRequest, GatewayProver, ProofSequence} from "../GatewayProver.sol";
import {LineaTrieHooks} from "./LineaTrieHooks.sol";

interface IRollup {
	function currentL2BlockNumber() external view returns (uint256);
	function stateRootHashes(uint256 l2BlockNumber) external view returns (bytes32);
}

contract LineaVerifier is AbstractVerifier {

	bytes32 constant SLOT_rollup = keccak256("unruggable.gateway.rollup");

	function _rollup() internal view returns (IRollup) {
		return IRollup(StorageSlot.getAddressSlot(SLOT_rollup).value);
	}

	function setRollup(address rollup) external onlyOwner {
		StorageSlot.getAddressSlot(SLOT_rollup).value = rollup;
		emit GatewayChanged();
	}

	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(_rollup().currentL2BlockNumber());
	}

	function getStorageValues(bytes memory context, GatewayRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 l2BlockNumber1 = abi.decode(context, (uint256));
		(
			uint256 l2BlockNumber,
			bytes[] memory proofs,
			bytes memory order
		) = abi.decode(proof, (uint256, bytes[], bytes));
		_checkWindow(l2BlockNumber1, l2BlockNumber);
		bytes32 stateRoot = _rollup().stateRootHashes(l2BlockNumber);
		require(stateRoot != bytes32(0), "Linea: not finalized");
		return GatewayProver.evalRequest(req, ProofSequence(0, 
			stateRoot, 
			proofs, order, 
			LineaTrieHooks.proveAccountState,
			LineaTrieHooks.proveStorageValue
		));
	}

}

