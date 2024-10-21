// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IReadBytesAt {
    function readBytesAt(uint256 slot) external view returns (bytes memory);
}
