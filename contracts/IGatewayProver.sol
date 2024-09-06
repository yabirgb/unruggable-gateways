// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {GatewayRequest} from "./GatewayProtocol.sol";

interface IGatewayProver {
	function proveRequest(bytes memory context, GatewayRequest memory req) external pure returns (bytes memory);
}
