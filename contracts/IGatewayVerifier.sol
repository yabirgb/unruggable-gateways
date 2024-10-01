// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {GatewayRequest} from "./GatewayRequest.sol";

interface IGatewayVerifier {
	
	function getLatestContext() external view returns(bytes memory);	
	function gatewayURLs() external view returns (string[] memory);

	function getStorageValues(
		bytes memory context,
		GatewayRequest memory req,
		bytes memory proof
	) external view returns (bytes[] memory values, uint8 exitCode);

}
