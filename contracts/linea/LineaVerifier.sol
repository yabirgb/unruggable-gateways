// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';
//import {IUnfinalizedHook} from "../IUnfinalizedHook.sol";

interface IRollup {
    function currentL2BlockNumber() external view returns (uint256);
    function stateRootHashes(
        uint256 l2BlockNumber
    ) external view returns (bytes32);
    //function shnarfFinalBlockNumbers(bytes32 shnarf) external view returns (uint256);
}

contract LineaVerifier is AbstractVerifier {
    IRollup immutable _rollup;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        IRollup rollup
    ) AbstractVerifier(urls, window, hooks) {
        _rollup = rollup;
    }

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(_rollup.currentL2BlockNumber());
    }

    struct GatewayProof {
        uint256 l2BlockNumber;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        uint256 l2BlockNumber1 = abi.decode(context, (uint256));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        _checkWindow(l2BlockNumber1, p.l2BlockNumber);
        bytes32 stateRoot = _rollup.stateRootHashes(p.l2BlockNumber);
        if (stateRoot == bytes32(0)) revert('Linea: not finalized');
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, stateRoot, p.proofs, p.order, _hooks)
            );
    }

    /*
	struct Shnarf {
		bytes32 parentShnarf;
		bytes32 snarkHash;
		bytes32 finalStateRootHash;
		bytes32 dataEvaluationPoint;
		bytes32 dataEvaluationClaim;
	}

	function proveUnfinalizedStateRoot(uint256 delta, bytes memory encodedProof) external view returns (bytes32 stateRoot) {
		// DataSubmittedV2 
		// shnarf -> endblock
		// shnarfFinalBlockNumbers(sharf) = endblock
		// endblock within delta

		// https://github.com/Consensys/linea-contracts/blob/b64fe259195f00e840d1e2a3f08b8e95e7c90918/contracts/LineaRollup.sol#L370
		Shnarf memory s = abi.decode(encodedProof, (Shnarf));
		uint256 l2BlockNumber = _rollup.shnarfFinalBlockNumbers(keccak256(s));

		return s.finalStateRootHash;

	}
	*/
}
