pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import {IPolygonRollup} from "./IPolygonRollup.sol";

contract PolygonRollup is IPolygonRollup, Ownable {

    uint256 private lastBlockNumber;
    mapping(uint256 => bytes32) private stateRoots;

    constructor() Ownable(msg.sender) {}

    function storeStateRoot(uint256 blockNumber, bytes32 stateRoot) public onlyOwner {
        require(blockNumber > lastBlockNumber, "Block number must be greater than the previous one");
        stateRoots[blockNumber] = stateRoot;
        lastBlockNumber = blockNumber;
    }

    function getStateRoot(uint256 blockNumber) public view returns (bytes32) {
        return stateRoots[blockNumber];
    }

    function getLatestStateRoot() public view returns (bytes32) {
        return getStateRoot(lastBlockNumber);
    }

    function getLatestBlockNumber() public view returns (uint256) {
        return lastBlockNumber;
    }
}