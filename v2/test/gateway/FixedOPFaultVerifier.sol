// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {OPFaultVerifier, IOptimismPortal} from "../../contracts/op/OPFaultVerifier.sol";

contract FixedOPFaultVerifier is OPFaultVerifier {

	uint256 immutable _gameIndex;

	constructor(string[] memory urls, uint256 window, IOptimismPortal portal, uint256 gameTypes, uint256 gameIndex) OPFaultVerifier(urls, window, portal, gameTypes) { 
		_gameIndex = gameIndex;
	}

	function getLatestContext() external override view returns (bytes memory) {
		return abi.encode(_gameIndex);
	}
}	
