// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ReadBytesAt {
    // NOTE: view seems like the wrong mutability annotation
    function readBytesAt(uint256 slot) external pure returns (bytes memory) {
        bytes storage v;
        assembly {
            v.slot := slot
        }
        return v;
    }
}
