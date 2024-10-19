import type {
  HexString,
  HexString32,
  ProofSequence,
  Provider,
} from '../types.js';
import {
  AbstractProver,
  type StateRooted,
  type LatestProverFactory,
} from '../vm.js';
import { AbstractRollup, type RollupCommit } from '../rollup.js';
import { ABI_CODER } from '../utils.js';
import { CachedValue } from '../cached.js';
import { VOID_PROVIDER } from '../void-provider.js';

export type DebugCommit<P extends AbstractProver & StateRooted> =
  RollupCommit<P> & {
    readonly stateRoot: HexString32;
  };

export class DebugRollup<
  P extends AbstractProver & StateRooted,
> extends AbstractRollup<DebugCommit<P>> {
  readonly latest;
  constructor(
    provider2: Provider,
    readonly factory: LatestProverFactory<P>
  ) {
    super({ provider1: VOID_PROVIDER, provider2 });
    this.latestBlockTag = 'latest';
    this.latest = new CachedValue<DebugCommit<P>>(async () => {
      const prover = await factory.latest(this.provider2, this.latestBlockTag);
      const stateRoot = await prover.fetchStateRoot();
      return { index: 0n, prover, stateRoot };
    }, 60000);
  }
  override get unfinalized() {
    return true;
  }
  override async fetchLatestCommitIndex(): Promise<bigint> {
    return 0n;
  }
  protected override async _fetchParentCommitIndex(
    _commit: RollupCommit<P>
  ): Promise<bigint> {
    return -1n;
  }
  protected override async _fetchCommit(
    _index: bigint
  ): Promise<DebugCommit<P>> {
    return this.latest.get();
  }
  override encodeWitness(
    commit: DebugCommit<P>,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(bytes32,bytes[],bytes)'],
      [[commit.stateRoot, proofSeq.proofs, proofSeq.order]]
    );
  }
  override windowFromSec(_sec: number): number {
    return 0;
  }
}
