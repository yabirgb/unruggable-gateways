import type {
  HexString,
  Proof,
  RPCEthGetBlock,
  RPCEthGetProof,
} from '../types.js';
import { ethers } from 'ethers';
import {
  AbstractCommit,
  AbstractGateway,
  ABI_CODER,
  encodeProofV1,
  type GatewayConstructor,
} from './AbstractGateway.js';

export const L2ToL1MessagePasser = '0x4200000000000000000000000000000000000016';

export type AbstractOPGatewayConstructor = GatewayConstructor & {
  L2ToL1MessagePasser?: HexString;
};

export class OPCommit extends AbstractCommit {
  constructor(
    index: number,
    readonly block: HexString,
    readonly blockHash: HexString,
    readonly stateRoot: HexString,
    readonly passerRoot: HexString
  ) {
    super(index);
  }
  rootProof() {
    return [ethers.ZeroHash, this.stateRoot, this.passerRoot, this.blockHash];
  }
}
const OutputRootProofType =
  'tuple(bytes32 version, bytes32 stateRoot, bytes32 messagePasserStorageRoot, bytes32 latestBlockhash)';

export abstract class AbstractOPGateway extends AbstractGateway<OPCommit> {
  readonly L2ToL1MessagePasser: HexString;
  constructor(args: AbstractOPGatewayConstructor) {
    super(args);
    this.L2ToL1MessagePasser = args.L2ToL1MessagePasser ?? L2ToL1MessagePasser;
  }
  override encodeWitness(
    commit: OPCommit,
    proofs: Proof[],
    order: Uint8Array
  ): HexString {
    return ABI_CODER.encode(
      [OutputRootProofType, 'bytes[][]', 'bytes'],
      [commit.rootProof(), proofs, order]
    );
  }
  override encodeWitnessV1(
    commit: OPCommit,
    accountProof: Proof,
    storageProofs: Proof[]
  ): HexString {
    return ABI_CODER.encode(
      [
        `tuple(uint256 outputIndex, ${OutputRootProofType})`,
        'tuple(bytes, bytes[])',
      ],
      [
        [commit.index, commit.rootProof()],
        [encodeProofV1(accountProof), storageProofs.map(encodeProofV1)],
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
    return new OPCommit(index, block, hash, stateRoot, passerRoot);
  }
}
