// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';

struct TransitionState {
    bytes32 key;
    bytes32 blockHash;
    bytes32 stateRoot;
    address prover;
    uint96 validityBond;
    address contester;
    uint96 contestBond;
    uint64 timestamp;
    uint16 tier;
    uint8 __reserved1;
}

// https://github.com/taikoxyz/taiko-mono/blob/main/packages/protocol/contracts/layer1/based/TaikoData.sol
interface ITaiko {
    function getTransition(
        uint64 blockId,
        bytes32 parentHash
    ) external view returns (TransitionState memory);
    function getLastSyncedBlock() external view returns (uint64 blockId); // rest of args ignored
}

contract TaikoVerifier is AbstractVerifier {
    ITaiko immutable _rollup;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        ITaiko rollup
    ) AbstractVerifier(urls, window, hooks) {
        _rollup = rollup;
    }

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(_rollup.getLastSyncedBlock());
    }

    struct GatewayProof {
        uint64 blockId;
        bytes32 parentHash;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        uint64 blockId1 = abi.decode(context, (uint64));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        // NOTE: this could use proposedAt time difference
        // since the current window estimate is a heuristic
        _checkWindow(blockId1, p.blockId);
        TransitionState memory ts = _rollup.getTransition(
            p.blockId,
            p.parentHash
        ); // reverts if invalid
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, ts.stateRoot, p.proofs, p.order, _hooks)
            );
    }
}
