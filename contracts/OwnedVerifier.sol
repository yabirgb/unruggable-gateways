// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./ProtocolData.sol";
import {IDataProofVerifier} from "./IDataProofVerifier.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

abstract contract OwnedVerifier is IDataProofVerifier, Ownable {

	event GatewayChanged();

	string[] _gatewayURLs;
	uint256 _window;

	constructor(string[] memory urls, uint256 window) Ownable(msg.sender) {
		_gatewayURLs = urls;
		_window = window;
	}

	function setGatewayURLs(string[] memory urls) external onlyOwner {
		_gatewayURLs = urls;
		emit GatewayChanged();
	}
	function setWindow(uint256 window) external onlyOwner {
		_window = window;
		emit GatewayChanged();
	}

	function gatewayURLs() external view returns (string[] memory) {
		return _gatewayURLs;
	}

	function _checkWindow(uint256 latest, uint256 got) internal view {
		if (got > latest) revert("too new");
		if (got + _window < latest) revert("too old");
	}

}
