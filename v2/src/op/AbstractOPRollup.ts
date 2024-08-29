import type { HexAddress, HexString } from '../types.js';
import type { RPCEthGetBlock, RPCEthGetProof } from '../eth/types.js';
import type { ProofSequence, ProofSequenceV1 } from '../vm.js';
import { AbstractRollupV1, type RollupCommit } from '../rollup.js';
import { EthProver } from '../eth/EthProver.js';
import { ZeroHash } from 'ethers';
import { ABI_CODER } from '../utils.js';

const OutputRootProofType = `tuple(
  bytes32 version,
  bytes32 stateRoot,
  bytes32 messagePasserStorageRoot,
  bytes32 latestBlockhash
)`;

export type OPCommit = RollupCommit<EthProver> & {
  readonly blockHash: HexString;
  readonly stateRoot: HexString;
  readonly passerRoot: HexString;
};

function outputRootProofTuple(commit: OPCommit) {
  return [ZeroHash, commit.stateRoot, commit.passerRoot, commit.blockHash];
}

export abstract class AbstractOPRollup extends AbstractRollupV1<OPCommit> {
  L2ToL1MessagePasser: HexAddress =
    '0x4200000000000000000000000000000000000016';
  async createCommit(index: bigint, block: HexString): Promise<OPCommit> {
    const [{ storageHash: passerRoot }, { stateRoot, hash: blockHash }] =
      await Promise.all([
        this.provider2.send('eth_getProof', [
          this.L2ToL1MessagePasser,
          [],
          block,
        ]) as Promise<RPCEthGetProof>,
        this.provider2.send('eth_getBlockByNumber', [
          block,
          false,
        ]) as Promise<RPCEthGetBlock>,
      ]);
    const prover = new EthProver(this.provider2, block);
    return {
      index,
      blockHash,
      stateRoot,
      passerRoot,
      prover,
    };
  }
  override encodeWitness(commit: OPCommit, proofSeq: ProofSequence) {
    return ABI_CODER.encode(
      ['uint256', OutputRootProofType, 'bytes[]', 'bytes'],
      [
        commit.index,
        outputRootProofTuple(commit),
        proofSeq.proofs,
        proofSeq.order,
      ]
    );
  }
  override encodeWitnessV1(commit: OPCommit, proofSeq: ProofSequenceV1) {
    return ABI_CODER.encode(
      [`tuple(uint256, ${OutputRootProofType})`, 'tuple(bytes, bytes[])'],
      [
        [commit.index, outputRootProofTuple(commit)],
        [proofSeq.accountProof, proofSeq.storageProofs],
      ]
    );
  }
}
