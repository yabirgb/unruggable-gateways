// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../EVMProtocol.sol";
import {IEVMVerifier} from "../IEVMVerifier.sol";
import {EVMProver, ProofSequence} from "../EVMProver.sol";
import {MerkleTrieHelper} from "../MerkleTrieHelper.sol";
import {RLPReader} from "@eth-optimism/contracts-bedrock/src/libraries/rlp/RLPReader.sol";

interface ITaiko {
	struct Block {
		bytes32 metaHash;
		address assignedProver;
		uint96 livenessBond;
		uint64 blockId; 
		uint64 proposedAt;
		uint64 proposedIn;
		uint32 nextTransitionId;
		uint32 verifiedTransitionId;
	}
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
	struct SlotA {
		uint64 genesisHeight;
		uint64 genesisTimestamp;
		uint64 lastSyncedBlockId;
		uint64 lastSynecdAt; // typo!
	}
	struct SlotB {
		uint64 numBlocks;
		uint64 lastVerifiedBlockId;
		bool provingPaused;
		uint8 __reservedB1;
		uint16 __reservedB2;
		uint32 __reservedB3;
		uint64 lastUnpausedAt;
	}
	struct State {
		//mapping(uint64 blockId_mod_blockRingBufferSize => Block blk) blocks;
		//mapping(uint64 blockId => mapping(bytes32 parentHash => uint32 transitionId)) transitionIds;
		//mapping(uint64 blockId_mod_blockRingBufferSize => mapping(uint32 transitionId => TransitionState ts)) transitions;
	 	bytes32 __reserve1;
		SlotA slotA;
		SlotB slotB;
		//mapping(address account => uint256 bond) bondBalance;
		//uint256[43] __gap;
	}
	function state() external view returns (State memory);
	function getTransition(uint64 _blockId, bytes32 _parentHash) external view returns (TransitionState memory);
	function getTransition(uint64 _blockId, uint32 _tid) external view returns (TransitionState memory);
	function getBlock(uint64 _blockId) external view returns (Block memory);	
}

contract UnverifiedTaikoVerifier is IEVMVerifier {

	string[] _gatewayURLs;
	ITaiko immutable _rollup;
	uint64 immutable _blockDelay;
	uint64 immutable _commitStep;

	constructor(string[] memory urls, ITaiko rollup, uint64 blockDelay, uint64 commitStep) {
		_gatewayURLs = urls;
		_rollup = rollup;
		_blockDelay = blockDelay;
		_commitStep = commitStep;
	}

	function gatewayURLs() external view returns (string[] memory) {
		return _gatewayURLs;
	}
	function getLatestContext() external view returns (bytes memory) {
		return abi.encode(findDelayedBlockId(_blockDelay));
	}

	function findDelayedBlockId(uint64 blocks) public view returns (uint64 blockId) {
		blockId = _rollup.state().slotB.numBlocks - 1;
		blockId -= (blocks * 3 / 2);
		blockId -= blockId % _commitStep;
		while (!isProvenBlock(blockId)) blockId -= _commitStep;
	}

	function isProvenBlock(uint64 blockId) internal view returns (bool proven) {
		try _rollup.getTransition(blockId, uint32(1)) returns (ITaiko.TransitionState memory) {
			proven = true;
		} catch {
		}
	}

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory, uint8) {
		uint64 blockId = abi.decode(context, (uint64));
		(bytes memory rlpEncodedBlock, bytes[][] memory proofs, bytes memory order) = abi.decode(proof, (bytes, bytes[][], bytes));
		RLPReader.RLPItem[] memory items = RLPReader.readList(rlpEncodedBlock);
		bytes32 parentHash = bytes32(RLPReader.readBytes(items[0]));
		ITaiko.TransitionState memory ts = _rollup.getTransition(blockId, parentHash);
		bytes32 blockHash = keccak256(rlpEncodedBlock);
		if (ts.blockHash != blockHash) {
			revert VerifierMismatch(context, blockHash, ts.blockHash);
		}
		bytes32 stateRoot = bytes32(RLPReader.readBytes(items[3]));
		return EVMProver.evalRequest(req, ProofSequence(0, stateRoot, proofs, order, MerkleTrieHelper.proveAccountState, MerkleTrieHelper.proveStorageValue));
	}

}
