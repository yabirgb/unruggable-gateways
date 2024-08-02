// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../EVMProtocol.sol";
import {IEVMVerifier} from "../IEVMVerifier.sol";
import {EVMProver, ProofSequence} from "../EVMProver.sol";
import {MerkleTrieHelper} from "../MerkleTrieHelper.sol";

import {RLPReader} from "@eth-optimism/contracts-bedrock/src/libraries/rlp/RLPReader.sol";
import {Node, IRollupCore} from "@arbitrum/nitro-contracts/src/rollup/IRollupCore.sol";

contract NitroVerifier is IEVMVerifier {

	string[] _gatewayURLs;
	IRollupCore immutable _rollup;
	uint256 immutable _delay;

	constructor(string[] memory _urls, IRollupCore rollup, uint256 delay) {
		_gatewayURLs = _urls;
		_rollup = rollup;
		_delay = delay;
	}

	function gatewayURLs() external view returns (string[] memory) {
		return _gatewayURLs;
	}
	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(findDelayedNodeNum(_delay));
	}

	function findDelayedNodeNum(uint256 blocks) public view returns (uint64 nodeNum) {
		uint256 delayed = block.number - blocks;
		for (nodeNum = _rollup.latestNodeCreated(); nodeNum > 0; --nodeNum) {
			if (_rollup.getNode(nodeNum).createdAtBlock <= delayed) {
				break;
			}
		}
	}

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint64 nodeNum = abi.decode(context, (uint64));
		(
			bytes32 sendRoot,
			bytes memory rlpEncodedBlock,
			bytes[] memory proofs,
			bytes memory order
		) = abi.decode(proof, (bytes32, bytes, bytes[], bytes));
		Node memory node = _rollup.getNode(nodeNum);
 		bytes32 confirmData = keccak256(abi.encodePacked(keccak256(rlpEncodedBlock), sendRoot));
		if (confirmData != node.confirmData) {
			revert VerifierMismatch(context, confirmData, node.confirmData);
		}
		bytes32 stateRoot = getStateRootFromBlock(rlpEncodedBlock);
		return EVMProver.evalRequest(req, ProofSequence(0, stateRoot, proofs, order, MerkleTrieHelper.proveAccountState, MerkleTrieHelper.proveStorageValue));
	}

	function getStateRootFromBlock(bytes memory rlpEncodedBlock) internal pure returns (bytes32) {
		RLPReader.RLPItem[] memory v = RLPReader.readList(rlpEncodedBlock);
		return bytes32(RLPReader.readBytes(v[3]));
	}

}
