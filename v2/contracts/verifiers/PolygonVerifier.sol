// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../EVMProtocol.sol";
import {IEVMVerifier} from "../IEVMVerifier.sol";
import {EVMProver, ProofSequence} from "../EVMProver.sol";
import {MerkleTrieHelper} from "../MerkleTrieHelper.sol";
import {IPolygonRollup} from "../rollup/IPolygonRollup.sol";

contract PolygonVerifier is IEVMVerifier {

	string[] _gatewayURLs;
	IPolygonRollup immutable _rollup;

	constructor(string[] memory _urls, IPolygonRollup rollup) {
		_gatewayURLs = _urls;
		_rollup = rollup;
	}

	function gatewayURLs() external view returns (string[] memory) {
		return _gatewayURLs;
	}

	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(_rollup.getLatestBlockNumber());
	}

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		
        uint256 blockNumber = abi.decode(context, (uint256));

		(
            uint256 blockNum,
			bytes[][] memory proofs,
            bytes memory order
		) = abi.decode(proof, (uint256, bytes[][], bytes));

		bytes32 stateRoot = _rollup.getStateRoot(blockNumber);
        
		return EVMProver.evalRequest(req, ProofSequence(0, stateRoot, proofs, order, MerkleTrieHelper.proveAccountState, MerkleTrieHelper.proveStorageValue));
	}
}
