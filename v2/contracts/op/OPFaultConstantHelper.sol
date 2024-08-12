// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract OPFaultConstantHelper {

	uint256 immutable _index;
	constructor(uint256 index) {
		_index = index;
	}

	function findDelayedGameIndex(address, uint256) external view returns (uint256) {
		return _index;
	}

}
