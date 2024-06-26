// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ProofUtils.sol";

import {RLPReader} from "@eth-optimism/contracts-bedrock/src/libraries/rlp/RLPReader.sol";
import {SecureMerkleTrie} from "./trie-with-nonexistance/SecureMerkleTrie.sol";

library MerkleTrieHelper {

	function proveStorageValue(bytes32 storageRoot, uint256 slot, bytes[] memory proof) internal pure returns (uint256) {
		(bool exists, bytes memory v) = SecureMerkleTrie.get(abi.encodePacked(slot), proof, storageRoot);
		return exists ? ProofUtils.uint256FromBytes(RLPReader.readBytes(v)) : 0;
	}

	function proveAccountState(bytes32 stateRoot, address target, bytes[] memory proof) internal pure returns (bytes32 storageRoot) {
		(bool exists, bytes memory v) = SecureMerkleTrie.get(abi.encodePacked(target), proof, stateRoot);
		if (!exists) return NOT_A_CONTRACT;
		RLPReader.RLPItem[] memory accountState = RLPReader.readList(v);
		bytes32 codeHash = bytes32(RLPReader.readBytes(accountState[3]));
		if (codeHash == NULL_CODE_HASH) return NOT_A_CONTRACT;
		return bytes32(RLPReader.readBytes(accountState[2]));
	}

}
