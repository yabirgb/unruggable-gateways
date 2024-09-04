// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../OwnedVerifier.sol";
import {DataProver, ProofSequence} from "../DataProver.sol";
import {LineaTrieHooks} from "./LineaTrieHooks.sol";

interface IRollup {
	function currentL2BlockNumber() external view returns (uint256);
	function stateRootHashes(uint256 l2BlockNumber) external view returns (bytes32);
}

contract LineaVerifier is OwnedVerifier {

	function getRollup() internal view returns (IRollup) {

		address rollupAddress = getProxy().readAddressFromConfig("rollupAddress");

		console2.log("rollupAddress");
		console2.logBytes(abi.encode(rollupAddress));

		return IRollup(rollupAddress);
	}


	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(getRollup().currentL2BlockNumber());
	}

	function getStorageValues(bytes memory context, DataRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 l2BlockNumber1 = abi.decode(context, (uint256));
		(
			uint256 l2BlockNumber,
			bytes[] memory proofs,
			bytes memory order
		) = abi.decode(proof, (uint256, bytes[], bytes));
		_checkWindow(l2BlockNumber1, l2BlockNumber);
		bytes32 stateRoot = getRollup().stateRootHashes(l2BlockNumber);
		require(stateRoot != bytes32(0), "Linea: not finalized");
		return DataProver.evalRequest(req, ProofSequence(0, 
			stateRoot, 
			proofs, order, 
			LineaTrieHooks.proveAccountState,
			LineaTrieHooks.proveStorageValue
		));
	}

}

