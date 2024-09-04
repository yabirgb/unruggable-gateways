// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./VerifierProxy.sol";
import "./ProtocolData.sol";
import {IDataProofVerifier} from "./IDataProofVerifier.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "forge-std/console2.sol"; // DEBUG

abstract contract OwnedVerifier is IDataProofVerifier, Ownable {

	event GatewayChanged();
	
	constructor() Ownable(msg.sender) {}

	function getProxy() internal view returns (VerifierProxy) {

		console2.log("GET PROXY");
				console2.logBytes(abi.encode(address(this)));

		address payable proxyAddress = payable(address(this));	
		return VerifierProxy(proxyAddress);
	}

	function lol() public view returns (uint256) {
		
		console2.logBytes(abi.encode(address(this)));
		return getWindow();
	}

	function gatewayURLs() public view returns (string[] memory) {
		VerifierProxy proxy = getProxy();
		string[] memory gatewayUrls = proxy.readStringArrayFromConfig("gatewayUrls");
		return gatewayUrls;
	}

	function getWindow() internal view returns (uint256) {
		uint256 window = getProxy().readUint256FromConfig("window");
		return window;
	}

	function _checkWindow(uint256 latest, uint256 got) internal view {
		if (got > latest) revert("too new");
		if (got + getWindow() < latest) revert("too old");
	}

}