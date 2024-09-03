// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {DataRequest} from "./ProtocolData.sol";

interface IDataProver {
	function proveRequest(bytes memory context, DataRequest memory req) external pure returns (bytes memory);
}
