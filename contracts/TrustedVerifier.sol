// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from './AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from './GatewayVM.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';

contract TrustedVerifier is AbstractVerifier {
    event GatewaySignerChanged();

    mapping(address signer => bool) _signers;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks
    ) AbstractVerifier(urls, window, hooks) {}

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(block.timestamp);
    }

    function setSigner(address signer, bool allow) external onlyOwner {
        _signers[signer] = allow;
        emit GatewaySignerChanged();
    }

    function isSigner(address signer) external view returns (bool) {
        return _signers[signer];
    }

    struct GatewayProof {
        bytes signature;
        uint64 signedAt;
        bytes32 stateRoot;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        uint256 t = abi.decode(context, (uint256));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        bytes32 hash = keccak256(
            // https://github.com/ethereum/eips/issues/191
            abi.encodePacked(
                hex'1900', // magic + version(0)
                address(0),
                p.signedAt,
                p.stateRoot
            )
        );
        address signer = ECDSA.recover(hash, p.signature);
        require(_signers[signer], 'Trusted: signer');
        _checkWindow(p.signedAt, t - _window / 2); // abs(signedAt - t) < _window/2
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, p.stateRoot, p.proofs, p.order, _hooks)
            );
    }
}
