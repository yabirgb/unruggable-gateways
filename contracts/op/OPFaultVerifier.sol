// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';
import {Hashing, Types} from '../../lib/optimism/packages/contracts-bedrock/src/libraries/Hashing.sol';
import '../../lib/optimism/packages/contracts-bedrock/src/dispute/interfaces/IDisputeGameFactory.sol';

interface IOptimismPortal {
    function disputeGameFactory() external view returns (IDisputeGameFactory);
    function respectedGameType() external view returns (GameType);
    // we don't care if the root was blacklisted, this only applies to withdrawals
    //function disputeGameBlacklist(IDisputeGame game) external view returns (bool);
}

interface IOPFaultGameFinder {
    function findFinalizedGameIndex(
        IOptimismPortal portal,
        uint256 gameTypes,
        uint256 gameCount
    ) external view returns (uint256);
}

contract OPFaultVerifier is AbstractVerifier {
    IOptimismPortal immutable _portal;
    IOPFaultGameFinder immutable _gameFinder;
    uint256 immutable _gameTypes;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        IOptimismPortal portal,
        IOPFaultGameFinder gameFinder,
        uint256 gameTypes
    ) AbstractVerifier(urls, window, hooks) {
        _portal = portal;
        _gameFinder = gameFinder;
        _gameTypes = gameTypes;
    }

    function getLatestContext() external view virtual returns (bytes memory) {
        return
            abi.encode(
                _gameFinder.findFinalizedGameIndex(_portal, _gameTypes, 0)
            );
    }

    struct GatewayProof {
        uint256 gameIndex;
        Types.OutputRootProof outputRootProof;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        uint256 gameIndex1 = abi.decode(context, (uint256));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        IDisputeGameFactory factory = _portal.disputeGameFactory();
        (GameType gt, , IDisputeGame gameProxy) = factory.gameAtIndex(
            p.gameIndex
        );
        if (p.gameIndex != gameIndex1) {
            // the gateway gave us a different game, so lets check it
            (, , IDisputeGame gameProxy1) = factory.gameAtIndex(gameIndex1);
            // check if game is within our window
            _checkWindow(
                Timestamp.unwrap(gameProxy1.resolvedAt()),
                Timestamp.unwrap(gameProxy.resolvedAt())
            );
            // check if game is finalized
            uint256 gameTypes = _gameTypes;
            if (gameTypes == 0)
                gameTypes = 1 << GameType.unwrap(_portal.respectedGameType());
            require(
                (gameTypes & (1 << GameType.unwrap(gt))) != 0,
                'OPFault: unsupported gameType'
            );
            require(
                gameProxy.status() == GameStatus.DEFENDER_WINS,
                'OPFault: not finalized'
            );
        }
        require(
            Claim.unwrap(gameProxy.rootClaim()) ==
                Hashing.hashOutputRootProof(p.outputRootProof),
            'OPFault: invalid root'
        );
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, p.outputRootProof.stateRoot, p.proofs, p.order,  _hooks)
            );
    }
}
