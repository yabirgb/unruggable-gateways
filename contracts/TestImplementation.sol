// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./VerifierProxy.sol";

contract TestImplementation {

    string public value;

    constructor(string memory _value) {
        value = _value;
    }

    function getValue() public view returns (string memory) {
        return value;
    }

    function setValue(string memory _value) public {
        value = _value;
    }

    //This method accesses and returns configuration data from the VerifierProxy contract for which this is the implementation contract
    function readFromConfig() public view returns (bytes memory) {  
        bytes32 key = bytes32(abi.encodePacked("key"));
        address payable proxyAddress = payable(address(this));
        return VerifierProxy(proxyAddress).getConfig(key);
    }
}