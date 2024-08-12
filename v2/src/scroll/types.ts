import { ethers } from 'ethers';

export const VERIFIER_ABI = new ethers.Interface([
  'function rollup() view returns (address)',
  'function poseidon() view returns (address)',
  'function verifyZkTrieProof(address account, bytes32 storageKey, bytes calldata proof) view returns (bytes32 stateRoot, bytes32 storageValue)',
]);

export const ROLLUP_ABI = new ethers.Interface([
  `function lastFinalizedBatchIndex() view returns (uint256)`,
]);

export const POSEIDON_ABI = new ethers.Interface([
  'function poseidon(uint256[2], uint256) external view returns (bytes32)',
]);
