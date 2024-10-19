// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from './AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from './GatewayVM.sol';

contract DebugVerifier is AbstractVerifier {
    constructor(
        string[] memory urls,
        IVerifierHooks hooks
    ) AbstractVerifier(urls, 0, hooks) {}

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(block.number);
    }

    struct GatewayProof {
        bytes32 stateRoot;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory /*context*/,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, p.stateRoot, p.proofs, p.order, _hooks)
            );
    }
}
