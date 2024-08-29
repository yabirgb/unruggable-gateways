// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {RLPReader} from "@eth-optimism/contracts-bedrock/src/libraries/rlp/RLPReader.sol";

library RLPReaderExt {

	function bytes32FromRLP(RLPReader.RLPItem memory item) internal pure returns (bytes32) {
		return bytes32FromRLP(RLPReader.readBytes(item));
	}

	function bytes32FromRLP(bytes memory v) internal pure returns (bytes32) {
		return bytes32(v) >> ((32 - v.length) << 3);
	}

}
