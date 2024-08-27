// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {NOT_A_CONTRACT, NULL_CODE_HASH} from "../ProofUtils.sol";
import {SecureMerkleTrie} from "./SecureMerkleTrie.sol";
import {RLPReader} from "@eth-optimism/contracts-bedrock/src/libraries/rlp/RLPReader.sol";

library EthTrieHooks {

	function proveAccountState(bytes32 stateRoot, address target, bytes memory proof) internal pure returns (bytes32 storageRoot) {
		(bool exists, bytes memory v) = SecureMerkleTrie.get(abi.encodePacked(target), abi.decode(proof, (bytes[])), stateRoot);
		if (!exists) return NOT_A_CONTRACT;
		RLPReader.RLPItem[] memory accountState = RLPReader.readList(v);
		bytes32 codeHash = _bytes32FromRLPBytes(RLPReader.readBytes(accountState[3]));
		return codeHash == NULL_CODE_HASH ? NOT_A_CONTRACT : _bytes32FromRLPBytes(RLPReader.readBytes(accountState[2]));
	}

	function proveStorageValue(bytes32 storageRoot, address, uint256 slot, bytes memory proof) internal pure returns (bytes32) {
		(bool exists, bytes memory v) = SecureMerkleTrie.get(abi.encodePacked(slot), abi.decode(proof, (bytes[])), storageRoot);
		return exists ? _bytes32FromRLPBytes(RLPReader.readBytes(v)) : bytes32(0);
	}

	function _bytes32FromRLPBytes(bytes memory v) internal pure returns (bytes32) {
		return bytes32(v) >> ((32 - v.length) << 3);
	}

}
