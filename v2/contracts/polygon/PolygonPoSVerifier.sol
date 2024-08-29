// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../OwnedVerifier.sol";
import {EVMRequest, EVMProver, ProofSequence} from "../EVMProver.sol";
import {EthTrieHooks} from "../eth/EthTrieHooks.sol";
import {IRootChainProxy} from "./IRootChainProxy.sol";
import {RLPReader, RLPReaderExt} from "../RLPReader.sol";

contract PolygonPoSVerifier is OwnedVerifier {

	IRootChainProxy _rootChain;
	mapping (address => bool) _posters;

	constructor(string[] memory urls, uint256 window, IRootChainProxy rootChain) OwnedVerifier(urls, window) {
		_rootChain = rootChain;
	}

	function togglePoster(address poster, bool allowed) onlyOwner external {
		_posters[poster] = allowed;
		emit GatewayChanged();
	}

	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(_rootChain.currentHeaderBlock());
	}

	struct GatewayProof {
		bytes rlpEncodedProof;
		bytes rlpEncodedBlock;
		bytes[] proofs;
		bytes order;
	}

	// 20240824: ~100k gas to prove the stateRoot
	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8 exitCode) {
		uint256 headerBlock1 = abi.decode(context, (uint256));
		GatewayProof memory p = abi.decode(proof, (GatewayProof));
		RLPReader.RLPItem[] memory v = RLPReader.readList(p.rlpEncodedProof);
		uint256 headerBlock = uint256(RLPReaderExt.bytes32FromRLP(v[0]));
		(bytes32 rootHash, uint256 l2BlockNumberStart, , uint256 t0, ) = _rootChain.headerBlocks(headerBlock);
		require(rootHash != bytes32(0), "PolygonPoS: checkpoint");
		if (headerBlock1 != headerBlock) {
			(, , , uint256 t1, ) = _rootChain.headerBlocks(headerBlock1);
			_checkWindow(t1, t0);
		}
		require(rootHash == _extractRootHash(v, l2BlockNumberStart), "PolygonPoS: rootHash");
		bytes32 prevBlockHash = _extractPrevBlockHash(v);
		require(prevBlockHash == keccak256(p.rlpEncodedBlock), "PolygonPoS: blockHash");
		v = RLPReader.readList(p.rlpEncodedBlock);
		bytes32 stateRoot = RLPReaderExt.bytes32FromRLP(v[3]);
		return EVMProver.evalRequest(req, ProofSequence(0,
			stateRoot,
			p.proofs, p.order,
			EthTrieHooks.proveAccountState, 
			EthTrieHooks.proveStorageValue
		));
	}

	function _extractPrevBlockHash(RLPReader.RLPItem[] memory v) internal view returns (bytes32) {
		bytes memory temp = RLPReader.readBytes(v[6]);
		uint256 logIndex = uint256(RLPReaderExt.bytes32FromRLP(v[9]));
		if (uint8(temp[0]) != 0) {
			assembly {
				// remove transaction type prefix
				mstore(add(temp, 1), sub(mload(temp), 1))
				temp := add(temp, 1)
			}
		}
		v = RLPReader.readList(temp); // receipt
		v = RLPReader.readList(v[3]); // logs
		require(v.length > logIndex, "PolygonPoS: logIndex");
		v = RLPReader.readList(v[logIndex]); // log
		address poster = address(uint160(uint256(RLPReaderExt.bytes32FromRLP(v[0]))));
		require(_posters[poster], "PolygonPoS: poster");
		v = RLPReader.readList(v[1]); // topics
		return RLPReaderExt.bytes32FromRLP(v[1]); // prevBlockHash
	}

	function _extractRootHash(RLPReader.RLPItem[] memory v, uint256 l2BlockNumberStart) internal pure returns (bytes32) {
		uint256 l2BlockNumber = uint256(RLPReaderExt.bytes32FromRLP(v[2]));
		bytes32 leafHash = keccak256(abi.encode(
			l2BlockNumber,
			RLPReaderExt.bytes32FromRLP(v[3]), // timestamp
			RLPReaderExt.bytes32FromRLP(v[4]), // transactionRoot
			RLPReaderExt.bytes32FromRLP(v[5])  // receiptRoot
		));
		return _computeRootHash(leafHash, RLPReader.readBytes(v[1]), l2BlockNumber -  l2BlockNumberStart);
	}

	function _computeRootHash(bytes32 hash, bytes memory proof, uint256 index) internal pure returns (bytes32) {
		for (uint256 i; i < proof.length; ) {
			unchecked { i += 32; }
			bytes32 next;
			assembly { next := mload(add(proof, i)) }
			if (index & 1 == 0) {
				hash = keccak256(abi.encodePacked(hash, next));
			} else {
				hash = keccak256(abi.encodePacked(next, hash));
			}
			index >>= 1;
		}
		return hash;
	}

}
