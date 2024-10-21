// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {NitroVerifier} from './NitroVerifier.sol';
import {IVerifierHooks} from '../IVerifierHooks.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';
import {RLPReader, RLPReaderExt} from '../RLPReaderExt.sol';
import {IRollupCore, Node} from './IRollupCore.sol';

contract DoubleNitroVerifier is NitroVerifier {
    address immutable _rollup2;
    GatewayRequest _nodeRequest;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        IRollupCore rollup,
        uint256 minBlocks,
        address rollup2,
        GatewayRequest memory nodeRequest
    ) NitroVerifier(urls, window, hooks, rollup, minBlocks) {
        _rollup2 = rollup2;
        _nodeRequest = nodeRequest;
    }

    struct GatewayProof2 {
        uint64 nodeNum;
        bytes32 sendRoot;
        bytes rlpEncodedBlock;
        bytes[] proofs;
        bytes order;
        bytes32 sendRoot2;
        bytes rlpEncodedBlock2;
        bytes[] proofs2;
        bytes order2;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view override returns (bytes[] memory, uint8 exitCode) {
        GatewayProof2 memory p = abi.decode(proof, (GatewayProof2));
        Node memory node = _verifyNode(context, p.nodeNum);
        bytes32 stateRoot = _verifyStateRoot(
            node.confirmData,
            p.rlpEncodedBlock,
            p.sendRoot
        );
        (bytes[] memory outputs, ) = GatewayVM.evalRequest(
            _nodeRequest,
            ProofSequence(0, stateRoot, p.proofs, p.order, _hooks)
        );
        // outputs[0] = node
        // outputs[1] = confirmData
        // outputs[2] = createdAtBlock (not used yet)
        bytes32 stateRoot2 = _verifyStateRoot(
            bytes32(outputs[1]), // confirmData
            p.rlpEncodedBlock2,
            p.sendRoot2
        );
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, stateRoot2, p.proofs2, p.order2, _hooks)
            );
    }
}
