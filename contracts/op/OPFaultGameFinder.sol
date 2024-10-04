// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// https://github.com/ethereum-optimism/optimism/issues/11269

// https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/L1/OptimismPortal.sol
interface IOptimismPortal {
    function disputeGameFactory() external view returns (IDisputeGameFactory);
    function respectedGameType() external view returns (uint256);
}

// https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/dispute/interfaces/IDisputeGameFactory.sol
interface IDisputeGameFactory {
    function gameCount() external view returns (uint256);
    function gameAtIndex(
        uint256 index
    )
        external
        view
        returns (uint256 gameType, uint256 created, IDisputeGame gameProxy);
}

// https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/dispute/interfaces/IDisputeGame.sol
interface IDisputeGame {
    function status() external view returns (uint256);
    function l2BlockNumber() external view returns (uint256);
}

uint256 constant DEFENDER_WINS = 2;

contract OPFaultGameFinder {
    error GameNotFound();

    function findFinalizedGameIndex(
        IOptimismPortal portal,
        uint256 gameTypes,
        uint256 i
    ) external view virtual returns (uint256) {
        if (gameTypes == 0) gameTypes = 1 << portal.respectedGameType();
        IDisputeGameFactory factory = portal.disputeGameFactory();
        if (i == 0) i = factory.gameCount();
        while (i > 0) {
            (uint256 gt, , IDisputeGame gameProxy) = factory.gameAtIndex(--i);
            if (_isFinalizedGame(gameTypes, gt, gameProxy)) {
                return i;
            }
        }
        revert GameNotFound();
    }

    function getFinalizedGame(
        IOptimismPortal portal,
        uint256 gameTypes,
        uint256 gameIndex
    )
        external
        view
        returns (
            uint256 gameType,
            IDisputeGame gameProxy,
            uint256 l2BlockNumber
        )
    {
        if (gameTypes == 0) gameTypes = 1 << portal.respectedGameType();
        IDisputeGameFactory factory = portal.disputeGameFactory();
        (gameType, , gameProxy) = factory.gameAtIndex(gameIndex);
        if (_isFinalizedGame(gameTypes, gameType, gameProxy)) {
            l2BlockNumber = gameProxy.l2BlockNumber();
        }
    }

    function _isFinalizedGame(
        uint256 gameTypes,
        uint256 gt,
        IDisputeGame gameProxy
    ) internal view returns (bool) {
        return
            (gameTypes & (1 << gt)) != 0 && gameProxy.status() == DEFENDER_WINS;
    }
}
