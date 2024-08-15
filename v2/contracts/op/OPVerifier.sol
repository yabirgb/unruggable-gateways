// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../OwnedVerifier.sol";
import {EVMProver, ProofSequence} from "../EVMProver.sol";
import {EthTrieHooks} from "../eth/EthTrieHooks.sol";
import {Hashing, Types} from "@eth-optimism/contracts-bedrock/src/libraries/Hashing.sol";

interface IL2OutputOracle {
	function latestOutputIndex() external view returns (uint256);
	function getL2Output(uint256 outputIndex) external view returns (Types.OutputProposal memory);
}

contract OPVerifier is OwnedVerifier {

	IL2OutputOracle immutable _oracle;

	constructor(string[] memory urls, uint256 window, IL2OutputOracle oracle) OwnedVerifier(urls, window) {
		_oracle = oracle;
	}

	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(_oracle.latestOutputIndex());
	}

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 latestOutputIndex = abi.decode(context, (uint256));
		(
			uint256 outputIndex,
			Types.OutputRootProof memory outputRootProof,
			bytes[] memory proofs,
			bytes memory order
		) = abi.decode(proof, (uint256, Types.OutputRootProof, bytes[], bytes));
		_checkWindow(latestOutputIndex, outputIndex);
		Types.OutputProposal memory output = _oracle.getL2Output(outputIndex);
		bytes32 computedRoot = Hashing.hashOutputRootProof(outputRootProof);
		require(computedRoot == output.outputRoot, "OP: invalid root");
		return EVMProver.evalRequest(req, ProofSequence(0, 
			outputRootProof.stateRoot,
			proofs, order,
			EthTrieHooks.proveAccountState,
			EthTrieHooks.proveStorageValue
		));
	}

}
