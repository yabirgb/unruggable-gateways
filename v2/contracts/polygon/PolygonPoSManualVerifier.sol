// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../OwnedVerifier.sol";
import {EVMRequest, EVMProver, ProofSequence} from "../EVMProver.sol";
import {EthTrieHooks} from "../eth/EthTrieHooks.sol";
import {IRootChainProxy} from "./IRootChainProxy.sol";
import {RLPReader} from "@eth-optimism/contracts-bedrock/src/libraries/rlp/RLPReader.sol";

contract PolygonPoSManualVerifier is OwnedVerifier {

	IRootChainProxy _rootChain;

	constructor(string[] memory urls, uint256 window, IRootChainProxy rootChain) OwnedVerifier(urls, window) {
		_rootChain = rootChain;
	}

	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(_rootChain.currentHeaderBlock());
	}

	struct ProofData {
		bytes[] headerProof;
		bytes encodedHeader;
		bytes[] receiptProof;
		bytes rlpEncodedReceipt;
	}

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 headerBlock1 = abi.decode(context, (uint256));
		(
			uint256 headerBlock,
			ProofData memory proofData,
			bytes[] memory proofs,
			bytes memory order
		) = abi.decode(proof, (uint256, ProofData, bytes[], bytes));
		_checkWindow(headerBlock1, headerBlock);
		//(bytes32 headerRoot, , , ,) = _rootChain.headerBlocks(headerBlock);
		// prove: block in header
		// show: block = (number, time, txRoot, receiptRoot)
		// prove: receipt in receiptRoot
		// show: receipt = <abi encoded>
		// check: logs = X
		RLPReader.RLPItem[] memory v = RLPReader.readList(proofData.rlpEncodedReceipt);
		v = RLPReader.readList(v[2]); // logs
		v = RLPReader.readList(v[0]); // log
		//require(RLPReader.readBytes(v[0]) === sender);
		v = RLPReader.readList(v[1]); // topics
		bytes32 stateRoot = EthTrieHooks._bytes32FromRLPBytes(RLPReader.readBytes(v[1]));
		return EVMProver.evalRequest(req, ProofSequence(0,
			stateRoot,
			proofs, order,
			EthTrieHooks.proveAccountState, 
			EthTrieHooks.proveStorageValue
		));
	}

}
