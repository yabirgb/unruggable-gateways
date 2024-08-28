import { ethers } from 'ethers';
import type { HexString, HexString32 } from '../types.js';

export const ROLLUP_ABI = new ethers.Interface([
  // ZkEvmV2.sol
  `function currentL2BlockNumber() view returns (uint256)`,
  `function stateRootHashes(uint256 l2BlockNumber) view returns (bytes32)`,
  // ILineaRollup.sol
  `event DataFinalized(
    uint256 indexed lastBlockFinalized,
    bytes32 indexed startingRootHash,
    bytes32 indexed finalRootHash,
    bool withProof
  )`,
  // IZkEvmV2.sol
  `event BlocksVerificationDone(uint256 indexed lastBlockFinalized, bytes32 startingRootHash, bytes32 finalRootHash)`,
]);

export type LineaProofObject = {
  proofRelatedNodes: HexString[];
  value: HexString;
};

export type LineaProofAbsence = {
  key: HexString32;
  leftLeafIndex: number;
  leftProof: LineaProofObject;
  rightLeafIndex: number;
  rightProof: LineaProofObject;
};

export type LineaProofExistance = {
  key: HexString32;
  leafIndex: number;
  proof: LineaProofObject;
};

export type LineaProof = LineaProofAbsence | LineaProofExistance;

export function isExistanceProof(proof: LineaProof) {
  return 'leafIndex' in proof;
}

export type RPCLineaGetProof = {
  accountProof: LineaProof;
  storageProofs: LineaProof[]; // note: this is plural
};
