import type { EncodedProof, HexString } from '../types.js';
import type { RPCEthGetBlock, RPCEthGetProof } from '../evm/types.js';
import { ethers } from 'ethers';
import {
  AbstractCommit,
  AbstractGateway,
  type AbstractGatewayConstructor,
} from '../AbstractGateway.js';
import { EVMProver } from '../evm/prover.js';
import { ABI_CODER } from '../utils.js';

export const L2ToL1MessagePasser = '0x4200000000000000000000000000000000000016';

export type AbstractOPGatewayConstructor = AbstractGatewayConstructor & {
  L2ToL1MessagePasser?: HexString;
};

export class OPCommit extends AbstractCommit<EVMProver> {
  constructor(
    index: number,
    prover: EVMProver,
    readonly blockHash: HexString,
    readonly stateRoot: HexString,
    readonly passerRoot: HexString
  ) {
    super(index, prover);
  }
  rootProof() {
    return [ethers.ZeroHash, this.stateRoot, this.passerRoot, this.blockHash];
  }
}
const OutputRootProofType =
  'tuple(bytes32 version, bytes32 stateRoot, bytes32 messagePasserStorageRoot, bytes32 latestBlockhash)';

export abstract class AbstractOPGateway extends AbstractGateway<
  EVMProver,
  OPCommit
> {
  readonly L2ToL1MessagePasser: HexString;
  constructor(args: AbstractOPGatewayConstructor) {
    super(args);
    this.L2ToL1MessagePasser = args.L2ToL1MessagePasser ?? L2ToL1MessagePasser;
  }
  override encodeWitness(
    commit: OPCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ): HexString {
    return ABI_CODER.encode(
      ['uint256', OutputRootProofType, 'bytes[]', 'bytes'],
      [commit.index, commit.rootProof(), proofs, order]
    );
  }
  override encodeWitnessV1(
    commit: OPCommit,
    accountProof: EncodedProof,
    storageProofs: EncodedProof[]
  ): HexString {
    return ABI_CODER.encode(
      [
        `tuple(uint256 outputIndex, ${OutputRootProofType})`,
        'tuple(bytes, bytes[])',
      ],
      [
        [commit.index, commit.rootProof()],
        [accountProof, storageProofs],
      ]
    );
  }
  async createOPCommit(index: number, block: HexString) {
    const [{ storageHash: passerRoot }, { stateRoot, hash }] =
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
    return new OPCommit(
      index,
      new EVMProver(this.provider2, block, this.makeCommitCache()),
      hash,
      stateRoot,
      passerRoot
    );
  }
}
