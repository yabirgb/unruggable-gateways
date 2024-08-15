// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {EVMRequest, EVMProver, ProofSequence} from "../EVMProver.sol";
import {EthTrieHooks} from "./EthTrieHooks.sol";

contract EthSelfVerifier {

	function verify(EVMRequest memory req, bytes32 stateRoot, bytes[] memory proofs, bytes memory order) external view returns (bytes[] memory outputs, uint8 exitCode) {
		return EVMProver.evalRequest(req, ProofSequence(0,
			stateRoot,
			proofs, order,
			EthTrieHooks.proveAccountState, 
			EthTrieHooks.proveStorageValue
		));
	}

}
