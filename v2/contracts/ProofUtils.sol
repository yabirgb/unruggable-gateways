// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

bytes32 constant NOT_A_CONTRACT = 0x0000000000000000000000000000000000000000000000000000000000000000;

bytes32 constant NULL_CODE_HASH = keccak256('');

library ProofUtils {

	function uint256FromBytes(bytes memory v) internal pure returns (uint256) {
		return uint256(v.length < 32 ? bytes32(v) >> ((32 - v.length) << 3) : bytes32(v));
	}

}
