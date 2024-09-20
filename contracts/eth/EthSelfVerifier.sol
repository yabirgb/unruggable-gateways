// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier} from "../AbstractVerifier.sol";
import {GatewayRequest, GatewayProver, ProofSequence} from "../GatewayProver.sol";
import {EthTrieHooks} from "./EthTrieHooks.sol";
import {RLPReader, RLPReaderExt} from "../RLPReaderExt.sol";

contract EthSelfVerifier is AbstractVerifier { 

	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(block.number - 1);
	}

	function getStorageValues(bytes memory context, GatewayRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 blockNumber1 = abi.decode(context, (uint256));
		(
			bytes memory rlpEncodedBlock, 
			bytes[] memory proofs,
			bytes memory order
		) = abi.decode(proof, (bytes, bytes[], bytes));
		RLPReader.RLPItem[] memory v = RLPReader.readList(rlpEncodedBlock);	
		uint256 blockNumber = uint256(RLPReaderExt.bytes32FromRLP(v[8]));
		_checkWindow(blockNumber1, blockNumber);
		bytes32 blockHash = blockhash(blockNumber);
		require(blockHash == keccak256(rlpEncodedBlock), "blockhash");
		bytes32 stateRoot = RLPReaderExt.strictBytes32FromRLP(v[3]);
		return verify(req, stateRoot, proofs, order);
	}

	function verify(GatewayRequest memory req, bytes32 stateRoot, bytes[] memory proofs, bytes memory order) public view returns (bytes[] memory outputs, uint8 exitCode) {
		return GatewayProver.evalRequest(req, ProofSequence(0,
			stateRoot,
			proofs, order,
			EthTrieHooks.proveAccountState, 
			EthTrieHooks.proveStorageValue
		));
	}

	function proveAccountState(bytes32 stateRoot, address target, bytes memory encodedProof) external pure returns (bytes32) {
		return EthTrieHooks.proveAccountState(stateRoot, target, encodedProof);
	}

	function proveStorageValue(bytes32 storageRoot, address target, uint256 slot, bytes memory encodedProof) external pure returns (bytes32) {
		return EthTrieHooks.proveStorageValue(storageRoot, target, slot, encodedProof);
	}

}
