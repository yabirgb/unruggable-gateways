import type { ChainPair, HexString, Provider, ProviderPair } from './types.js';
import type { AbstractProver, ProofSequence, ProofSequenceV1 } from './vm.js';

export type RollupDeployment<Config> = Readonly<ChainPair & Config>;

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
  latestBlockTag = 'finalized';
  getLogsStepSize = 1000n;
  readonly provider1: Provider;
  readonly provider2: Provider;
  constructor(providers: ProviderPair) {
    this.provider1 = providers.provider1;
    this.provider2 = providers.provider2;
  }

  // abstract interface
  abstract fetchLatestCommitIndex(): Promise<bigint>;
  protected abstract _fetchParentCommitIndex(commit: C): Promise<bigint>;
  protected abstract _fetchCommit(index: bigint): Promise<C>;
  abstract encodeWitness(commit: C, proofSeq: ProofSequence): HexString;
  abstract windowFromSec(sec: number): number;

  // abstract wrappers
  async fetchParentCommitIndex(commit: C) {
    try {
      if (!commit.index) throw new Error('genesis');
      const index = await this._fetchParentCommitIndex(commit);
      if (index >= commit.index) throw new Error('bug');
      if (index < 0) throw undefined;
      return index;
    } catch (cause) {
      throw new Error(`no earlier commit: ${commit.index}`, { cause });
    }
  }
  async fetchCommit(index: bigint) {
    const commit = await this._fetchCommit(index);
    this.configure?.(commit);
    return commit;
  }

  // convenience
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
      commit = await this.fetchParentCommit(commit);
      v.push(commit);
    }
    return v;
  }
  get defaultWindow() {
    return this.windowFromSec(86400);
  }
}

export abstract class AbstractRollupV1<
  C extends RollupCommit<AbstractProver>,
> extends AbstractRollup<C> {
  abstract encodeWitnessV1(commit: C, proofSeq: ProofSequenceV1): HexString;
}
