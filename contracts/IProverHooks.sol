// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IProverHooks {
	function proveAccountState(bytes32 stateRoot, address target, bytes memory proof) external view returns (bytes32 storageRoot);
	function proveStorageValue(bytes32 storageRoot, address target, uint256 slot, bytes memory proof) external view returns (bytes32);
}
