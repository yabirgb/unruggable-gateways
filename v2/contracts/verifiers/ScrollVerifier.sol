// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../EVMProtocol.sol";
import {IEVMVerifier} from "../IEVMVerifier.sol";
import {EVMProver, ProofSequence} from "../EVMProver.sol";
import {ZkTrieHelper} from "../ZkTrieHelper.sol";

interface IScrollChain {
	function lastFinalizedBatchIndex() external view returns (uint256);
	function finalizedStateRoots(uint256 batchIndex) external view returns (bytes32);
}

interface IScrollChainCommitmentVerifier {
	function rollup() external view returns (IScrollChain);
	function poseidon() external view returns (address);
}

contract ScrollVerifier is IEVMVerifier {

	string[] _gatewayURLs;
	IScrollChainCommitmentVerifier immutable _oracle;
	uint128 immutable _delay;
	uint128 immutable _step;

	constructor(string[] memory urls, IScrollChainCommitmentVerifier oracle, uint128 delay, uint128 step) {
		_gatewayURLs = urls;
		_oracle = oracle;
		_delay = delay;
		_step = step;
	}

	function gatewayURLs() external view returns (string[] memory) {
		return _gatewayURLs;
	}
	function getLatestContext() external view returns (bytes memory) {
		uint256 index = _oracle.rollup().lastFinalizedBatchIndex() - _delay;
		index -= (index % _step);
		return abi.encode(index);
	}

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 index = abi.decode(context, (uint256));
		(bytes[][] memory proofs, bytes memory order) = abi.decode(proof, (bytes[][], bytes));
		bytes32 stateRoot = _oracle.rollup().finalizedStateRoots(index);
		return EVMProver.evalRequest(req, ProofSequence(0, stateRoot, proofs, order, proveAccountState, proveStorageValue));
	}

	function proveStorageValue(bytes32 storageRoot, uint256 slot, bytes[] memory proof) internal view returns (uint256) {
		return uint256(ZkTrieHelper.proveStorageValue(_oracle.poseidon(), storageRoot, slot, proof));
	}

	function proveAccountState(bytes32 stateRoot, address target, bytes[] memory proof) internal view returns (bytes32) {
		return ZkTrieHelper.proveAccountState(_oracle.poseidon(), stateRoot, target, proof);
	}

}
