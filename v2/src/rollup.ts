import type { ChainPair, HexString, Provider, ProviderPair } from './types.js';
import type { AbstractProver, ProofSequence, ProofSequenceV1 } from './vm.js';

export type RollupDeployment<Config> = ChainPair & Config;

export type RollupCommit<P extends AbstractProver> = {
  readonly index: bigint;
  readonly prover: P;
};

export type Rollup = AbstractRollup<RollupCommit<AbstractProver>>;

export type RollupCommitType<R extends Rollup> = Parameters<
  R['fetchParentCommitIndex']
>[0];

export abstract class AbstractRollup<C extends RollupCommit<AbstractProver>> {
  // allows configuration of commit and prover
  // "expand LRU cache" => prover.proofLRU.maxCached = 1_000_000
  // "disable fast cache" => prover.fastCache = undefined
  // "keep fast cache around longer" => prover.fastCache?.cacheMs = Infinity
  // "limit targets" => prover.maxUniqueTargets = 1
  configure: (<T extends C>(commit: T) => void) | undefined;
  readonly provider1: Provider;
  readonly provider2: Provider;
  constructor(providers: ProviderPair) {
    this.provider1 = providers.provider1;
    this.provider2 = providers.provider2;
  }
  abstract fetchLatestCommitIndex(): Promise<bigint>;
  abstract fetchParentCommitIndex(commit: C): Promise<bigint>;
  protected abstract _fetchCommit(index: bigint): Promise<C>;
  async fetchCommit(index: bigint): Promise<C> {
    const commit = await this._fetchCommit(index);
    this.configure?.(commit);
    return commit;
  }
  abstract encodeWitness(commit: C, proofSeq: ProofSequence): HexString;
  async fetchLatestCommit() {
    return this.fetchCommit(await this.fetchLatestCommitIndex());
  }
  async fetchParentCommit(commit: C) {
    return this.fetchCommit(await this.fetchParentCommitIndex(commit));
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
  abstract encodeWitnessV1(commit: C, proofSeq: ProofSequenceV1): HexString;
}
