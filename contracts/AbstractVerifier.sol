// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IDataProofVerifier} from "./IDataProofVerifier.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {StorageSlot} from "@openzeppelin/contracts/utils/StorageSlot.sol";

abstract contract AbstractVerifier is IDataProofVerifier {
	
	event GatewayChanged();

	bytes32 constant SLOT_urls = keccak256("unruggable.gateway.urls");
	bytes32 constant SLOT_window = keccak256("unruggable.gateway.window");

	modifier onlyOwner() {
		require(msg.sender == _owner(), "not admin owner");
		_;
	}

	function _owner() internal view returns (address) {
		return Ownable(ERC1967Utils.getAdmin()).owner();
	}
	
	function owner() external view returns (address) {
		return _owner();
	}

	function setGatewayURLs(string[] calldata urls) external onlyOwner {
		StorageSlot.getBytesSlot(SLOT_urls).value = abi.encode(urls);
		emit GatewayChanged();
	}

	function gatewayURLs() external view returns (string[] memory) {
		return abi.decode(StorageSlot.getBytesSlot(SLOT_urls).value, (string[]));
	}

	function setWindow(uint256 window) external onlyOwner {
		StorageSlot.getUint256Slot(SLOT_window).value = window;
		emit GatewayChanged();
	}

	function getWindow() external view returns (uint256) {
		return StorageSlot.getUint256Slot(SLOT_window).value;
	}

	function _checkWindow(uint256 latest, uint256 got) internal view {
		uint256 window = StorageSlot.getUint256Slot(SLOT_window).value;
		if (got + window < latest) revert("too old");
		if (got > latest) revert("too new");
	}

}