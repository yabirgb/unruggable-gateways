// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, StorageSlot} from "../AbstractVerifier.sol";
import {GatewayRequest, GatewayProver, ProofSequence} from "../GatewayProver.sol";
import {EthTrieHooks} from "../eth/EthTrieHooks.sol";
import {RLPReader, RLPReaderExt} from "../RLPReaderExt.sol";

interface IL1Block {
	function number() external view returns (uint256); 
}

//import "forge-std/console2.sol";

contract OPReverseVerifier is AbstractVerifier {

	bytes32 constant SLOT_oracle = keccak256("unruggable.gateway.oracle");
	uint256 immutable SLOT_HASH = 2; // TODO: does this need customized?
	address immutable BEACON_ROOTS_ADDRESS = 0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02;

	function _oracle() internal view returns (IL1Block) {
		return IL1Block(StorageSlot.getAddressSlot(SLOT_oracle).value);
	}

	function setOracle(address oracle) external onlyOwner {
		StorageSlot.getAddressSlot(SLOT_oracle).value = oracle;
		emit GatewayChanged();
	}

	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(_oracle().number());
	}

	struct GatewayProof {
		bytes rlpEncodedL1Block;
		bytes rlpEncodedL2Block;
		bytes accountProof;
		bytes storageProof;
		bytes[] proofs;
		bytes order;
	}

	function _extractBlockNumber(RLPReader.RLPItem[] memory v) internal pure returns (uint256) {
		return uint256(RLPReaderExt.bytes32FromRLP(v[8]));
	}

	function getStorageValues(bytes memory context, GatewayRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 blockNumber1 = abi.decode(context, (uint256));
		GatewayProof memory p = abi.decode(proof, (GatewayProof));
		RLPReader.RLPItem[] memory v = RLPReader.readList(p.rlpEncodedL2Block);
		bytes32 blockHash = blockhash(_extractBlockNumber(v));

		// console2.logBytes32(blockHash);
		// console2.logBytes32(RLPReaderExt.strictBytes32FromRLP(v[19]));
		// (, bytes memory u) = BEACON_ROOTS_ADDRESS.staticcall(abi.encode(RLPReaderExt.bytes32FromRLP(v[11])));
		// console2.logBytes(u);

		require(blockHash == keccak256(p.rlpEncodedL2Block), "ReverseOP: hash2");
		bytes32 stateRoot = RLPReaderExt.strictBytes32FromRLP(v[3]);
		bytes32 storageRoot = EthTrieHooks.proveAccountState(stateRoot, address(_oracle()), p.accountProof);
		blockHash = EthTrieHooks.proveStorageValue(storageRoot, address(0), SLOT_HASH, p.storageProof);
		require(blockHash == keccak256(p.rlpEncodedL1Block), "ReverseOP: hash1");
		v = RLPReader.readList(p.rlpEncodedL1Block);
		_checkWindow(blockNumber1, _extractBlockNumber(v));
		stateRoot = RLPReaderExt.strictBytes32FromRLP(v[3]);
		return GatewayProver.evalRequest(req, ProofSequence(0, 
			stateRoot,
			p.proofs, p.order,
			EthTrieHooks.proveAccountState,
			EthTrieHooks.proveStorageValue
		));
	}

}
