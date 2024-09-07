// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, StorageSlot} from "../AbstractVerifier.sol";
import {GatewayRequest, GatewayProver, ProofSequence} from "../GatewayProver.sol";
import {EthTrieHooks} from "../eth/EthTrieHooks.sol";
import {RLPReader, RLPReaderExt} from "../RLPReaderExt.sol";

interface IL1Block {
	function number() external view returns (uint256);
	function hash() external view returns (bytes32);
}

contract OPReverseVerifier is AbstractVerifier {

	bytes32 constant SLOT_oracle = keccak256("unruggable.gateway.oracle");

	function _oracle() internal view returns (IL1Block) {
		return IL1Block(StorageSlot.getAddressSlot(SLOT_oracle).value);
	}

	function setOracle(address oracle) external onlyOwner {
		StorageSlot.getAddressSlot(SLOT_oracle).value = oracle;
		emit GatewayChanged();
	}

	function getLatestContext() external view returns (bytes memory) {
		IL1Block oracle = _oracle();
		return abi.encode(oracle.number(), oracle.hash());
	}

	function getStorageValues(bytes memory context, GatewayRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		(uint256 blockNumber, bytes32 blockHash) = abi.decode(context, (uint256, bytes32));
		(
			bytes memory rlpEncodedBlock,
			bytes[] memory proofs,
			bytes memory order
		) = abi.decode(proof, (bytes, bytes[], bytes));
		require(blockHash == keccak256(rlpEncodedBlock), "ReverseOP: hash");
		RLPReader.RLPItem[] memory v = RLPReader.readList(rlpEncodedBlock);
		require(blockNumber == uint256(RLPReaderExt.bytes32FromRLP(v[8])), "ReverseOP: number");
		bytes32 stateRoot = RLPReaderExt.strictBytes32FromRLP(v[3]);
		return GatewayProver.evalRequest(req, ProofSequence(0, 
			stateRoot,
			proofs, order,
			EthTrieHooks.proveAccountState,
			EthTrieHooks.proveStorageValue
		));
	}

}
