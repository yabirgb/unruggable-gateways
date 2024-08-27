import type {
  ChainPair,
  EncodedProof,
  HexString,
  Provider,
  ProviderPair,
} from './types.js';
import type { AbstractProver } from './vm.js';

export type RollupDeployment<Config> = ChainPair & Config;

export type RollupCommit<P extends AbstractProver> = {
  readonly index: bigint;
  readonly prover: P;
};

export type Rollup = AbstractRollup<RollupCommit<AbstractProver>>;

export abstract class AbstractRollup<C extends RollupCommit<AbstractProver>> {
  commitCacheSize = 10000;
  readonly provider1: Provider;
  readonly provider2: Provider;
  constructor(providers: ProviderPair) {
    this.provider1 = providers.provider1;
    this.provider2 = providers.provider2;
  }
  abstract fetchLatestCommitIndex(): Promise<bigint>;
  abstract fetchParentCommitIndex(commit: C): Promise<bigint>;
  abstract fetchCommit(index: bigint): Promise<C>;
  abstract encodeWitness(
    commit: C,
    proofs: EncodedProof[],
    order: Uint8Array
  ): HexString;
  async fetchLatestCommit() {
    return this.fetchCommit(await this.fetchLatestCommitIndex());
  }
  async fetchRecentCommits(count: number): Promise<C[]> {
    if (count < 1) return [];
    let commit = await this.fetchLatestCommit();
    const v = [commit];
    while (v.length < count && commit.index > 0) {
      commit = await this.fetchCommit(
        await this.fetchParentCommitIndex(commit)
      );
      v.push(commit);
    }
    return v;
  }
  abstract windowFromSec(sec: number): number;
  get defaultWindow() {
    return this.windowFromSec(86400);
  }
}

export abstract class AbstractRollupV1<
  C extends RollupCommit<AbstractProver>,
> extends AbstractRollup<C> {
  abstract encodeWitnessV1(
    commit: C,
    accountProof: EncodedProof,
    storageProofs: EncodedProof[]
  ): HexString;
}
