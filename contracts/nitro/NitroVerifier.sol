// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../OwnedVerifier.sol";
import {DataProver, ProofSequence} from "../DataProver.sol";
import {EthTrieHooks} from "../eth/EthTrieHooks.sol";
import {RLPReader} from "@eth-optimism/contracts-bedrock/src/libraries/rlp/RLPReader.sol";
import {Node, IRollupCore} from "@arbitrum/nitro-contracts/src/rollup/IRollupCore.sol";

contract NitroVerifier is OwnedVerifier {

	IRollupCore immutable _rollup;

	constructor(string[] memory urls, uint256 window, IRollupCore rollup) OwnedVerifier(urls, window) {
		_rollup = rollup;
	}

	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(_rollup.latestConfirmed());
	}

	function getStorageValues(bytes memory context, DataRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint64 nodeNum1 = abi.decode(context, (uint64));
		(
			uint64 nodeNum,
			bytes32 sendRoot,
			bytes memory rlpEncodedBlock,
			bytes[] memory proofs,
			bytes memory order
		) = abi.decode(proof, (uint64, bytes32, bytes, bytes[], bytes));
		Node memory node = _rollup.getNode(nodeNum);
		if (nodeNum != nodeNum1) {
			Node memory node1 = _rollup.getNode(nodeNum1);
			_checkWindow(node1.createdAtBlock, node.createdAtBlock);
		}
 		bytes32 confirmData = keccak256(abi.encodePacked(keccak256(rlpEncodedBlock), sendRoot));
		require(confirmData == node.confirmData, "Nitro: confirmData");
		RLPReader.RLPItem[] memory v = RLPReader.readList(rlpEncodedBlock);
		bytes32 stateRoot =bytes32(RLPReader.readBytes(v[3])); // see: rlp.ts: encodeRlpBlock()
		return DataProver.evalRequest(req, ProofSequence(0,
			stateRoot,
			proofs, order,
			EthTrieHooks.proveAccountState,
			EthTrieHooks.proveStorageValue
		));
	}

}
