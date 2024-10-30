// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IGatewayVerifier} from './IGatewayVerifier.sol';
import {IVerifierHooks} from './IVerifierHooks.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from './GatewayVM.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

contract TrustedVerifier is IGatewayVerifier {
    event GatewayChanged(address indexed fetcher);

    struct Config {
        mapping(address signer => bool) signers;
        string[] urls;
        uint256 expSec;
        IVerifierHooks hooks;
    }

    mapping(address fetcher => Config) _configs;

    function gatewayURLs() external view returns (string[] memory) {
        return _configs[msg.sender].urls;
    }

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(block.timestamp, msg.sender);
    }

    modifier _canModifyFetcher(address op, address fetcher) {
        if (fetcher == op) {
            require(fetcher.code.length != 0, 'Trusted: not code');
        } else {
            try Ownable(fetcher).owner() returns (address a) {
                require(a == op, 'Trusted: not owner');
            } catch {
                revert('Trusted: not Ownable');
            }
        }
        _;
    }

    function setConfig(
        address fetcher,
        string[] memory urls,
        uint256 expSec,
        IVerifierHooks hooks
    ) external _canModifyFetcher(msg.sender, fetcher) {
        Config storage c = _configs[fetcher];
        c.urls = urls;
        c.expSec = expSec;
        c.hooks = hooks;
        emit GatewayChanged(fetcher);
    }

    function setSigner(
        address fetcher,
        address signer,
        bool allow
    ) external _canModifyFetcher(msg.sender, fetcher) {
        _configs[fetcher].signers[signer] = allow;
        emit GatewayChanged(fetcher);
    }

    function getConfig(
        address sender
    )
        external
        view
        returns (string[] memory urls, uint256 expSec, IVerifierHooks hooks)
    {
        Config storage c = _configs[sender];
        urls = c.urls;
        expSec = c.expSec;
        hooks = c.hooks;
    }

    function isSigner(
        address sender,
        address signer
    ) external view returns (bool) {
        return _configs[sender].signers[signer];
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
        (uint256 t, address sender) = abi.decode(context, (uint256, address));
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
        Config storage c = _configs[sender];
        require(c.signers[signer], 'Trusted: signer');
        uint256 dt = p.signedAt > t ? p.signedAt - t : t - p.signedAt;
        require(dt <= c.expSec, 'Trusted: expired');
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, p.stateRoot, p.proofs, p.order, c.hooks)
            );
    }
}
