// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./EVMProtocol.sol";

interface IEVMProver {
	function proveRequest(bytes memory context, EVMRequest memory req) external pure returns (bytes memory);
}
