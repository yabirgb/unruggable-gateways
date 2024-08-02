// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

struct TreeEntry {
	uint256 key;
	bytes32 value;
	uint64 leafIndex;
}

interface IZKSyncSMT {
	function getRootHash(
		bytes32[] calldata proof,
		TreeEntry memory entry,
		address account
	) external view returns (bytes32);
}
