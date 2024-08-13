import { ethers } from 'ethers';
import type { HexString, HexString32 } from '../types.js';

export const L1_ABI = new ethers.Interface([
  `function currentL2BlockNumber() view returns (uint256)`,
  `function stateRootHashes(uint256 l2BlockNumber) view returns (bytes32)`,
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

export type RPCLineaGetProof = {
  accountProof: LineaProof;
  storageProofs: LineaProof[]; // note: this is plural
};
