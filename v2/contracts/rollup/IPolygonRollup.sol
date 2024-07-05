pragma solidity ^0.8.25;

interface IPolygonRollup {
    function storeStateRoot(uint256 blockNumber, bytes32 stateRoot) external;
    function getStateRoot(uint256 blockNumber) external view returns (bytes32);
    function getLatestStateRoot() external view returns (bytes32);
    function getLatestBlockNumber() external view returns (uint256);
}