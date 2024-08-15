import type {
  ChainPair,
  EncodedProof,
  HexString,
  ProviderPair,
} from './types.js';
import type { AbstractProver } from './vm.js';

export type RollupDeployment<Config> = ChainPair &
  Config & {
    suggestedWindow: number;
  };

export type RollupCommit<P extends AbstractProver> = Readonly<{
  index: bigint;
  prover: P;
}>;

export abstract class AbstractRollup<
  P extends AbstractProver,
  C extends RollupCommit<P>,
> {
  commitCacheSize = 10000;
  commitStep = 1;
  constructor(readonly providers: ProviderPair) {}
  async fetchLatestCommit() {
    return this.fetchCommit(await this.fetchLatestCommitIndex());
  }
  abstract fetchLatestCommitIndex(): Promise<bigint>;
  abstract fetchParentCommitIndex(commit: C): Promise<bigint>;
  abstract fetchCommit(index: bigint): Promise<C>;
  abstract encodeWitness(
    commit: C,
    proofs: EncodedProof[],
    order: Uint8Array
  ): HexString;
  abstract encodeWitnessV1(
    commit: C,
    accountProof: EncodedProof,
    storageProofs: EncodedProof[]
  ): HexString;
  shutdown() {
    this.providers.provider1.destroy();
    this.providers.provider2.destroy();
  }
}

export abstract class AbstractRollupNoV1<
  P extends AbstractProver,
  C extends RollupCommit<P>,
> extends AbstractRollup<P, C> {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  override encodeWitnessV1(
    _commit: C,
    _accountProof: EncodedProof,
    _storageProofs: EncodedProof[]
  ): HexString {
    throw new Error('V1 not implemented');
  }
}
