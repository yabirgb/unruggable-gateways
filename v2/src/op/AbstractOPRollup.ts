import type { EncodedProof, HexAddress, HexString } from '../types.js';
import type { RPCEthGetBlock, RPCEthGetProof } from '../eth/types.js';
import { AbstractRollup, type RollupCommit } from '../rollup.js';
import { EthProver } from '../eth/EthProver.js';
import { ethers } from 'ethers';
import { CachedMap } from '../cached.js';
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
  return [
    ethers.ZeroHash,
    commit.stateRoot,
    commit.passerRoot,
    commit.blockHash,
  ];
}

export abstract class AbstractOPRollup extends AbstractRollup<
  EthProver,
  OPCommit
> {
  L2ToL1MessagePasser: HexAddress =
    '0x4200000000000000000000000000000000000016';
  async createCommit(index: bigint, block: HexString): Promise<OPCommit> {
    const { provider2 } = this.providers;
    const [{ storageHash: passerRoot }, { stateRoot, hash: blockHash }] =
      await Promise.all([
        provider2.send('eth_getProof', [
          this.L2ToL1MessagePasser,
          [],
          block,
        ]) as Promise<RPCEthGetProof>,
        provider2.send('eth_getBlockByNumber', [
          block,
          false,
        ]) as Promise<RPCEthGetBlock>,
      ]);
    return {
      index,
      blockHash,
      stateRoot,
      passerRoot,
      prover: new EthProver(
        provider2,
        block,
        new CachedMap(Infinity, this.commitCacheSize)
      ),
    };
  }
  override encodeWitness(
    commit: OPCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ): HexString {
    return ABI_CODER.encode(
      ['uint256', OutputRootProofType, 'bytes[]', 'bytes'],
      [commit.index, outputRootProofTuple(commit), proofs, order]
    );
  }
  override encodeWitnessV1(
    commit: OPCommit,
    accountProof: EncodedProof,
    storageProofs: EncodedProof[]
  ): HexString {
    return ABI_CODER.encode(
      [`tuple(uint256, ${OutputRootProofType})`, 'tuple(bytes, bytes[])'],
      [
        [commit.index, outputRootProofTuple(commit)],
        [accountProof, storageProofs],
      ]
    );
  }
}
