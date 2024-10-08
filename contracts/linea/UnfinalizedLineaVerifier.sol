// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';
import {ILineaRollup} from './ILineaRollup.sol';

contract UnfinalizedLineaVerifier is AbstractVerifier {
    ILineaRollup immutable _rollup;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        ILineaRollup rollup
    ) AbstractVerifier(urls, window, hooks) {
        _rollup = rollup;
    }

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(block.number - 1);
    }

    struct GatewayProof {
        uint256 l1BlockNumber;
        bytes abiEncodedTuple;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory /*context*/,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        //uint256 l1BlockNumber1 = abi.decode(context, (uint256));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        // TODO: need to prove p.l1BlockNumber somehow
        //_checkWindow(p.l1BlockNumber, l1BlockNumber1);
        uint256 l2BlockNumber = _rollup.shnarfFinalBlockNumbers(
            keccak256(p.abiEncodedTuple)
        );
        // this is the only guard available
        // the shnarf must be newer than the finalization
        require(
            l2BlockNumber > _rollup.currentL2BlockNumber(),
            'UnfinalizedLinea: l2'
        );
        bytes32 stateRoot;
        assembly {
            stateRoot := mload(add(p, 96)) // see: ShnarfData
        }
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, stateRoot, p.proofs, p.order, _hooks)
            );
    }
}
