import type { AbstractProver } from './vm.js';
import {
  type RollupCommit,
  type AbstractRollup,
  AbstractRollupV1,
} from './rollup.js';
import { ethers } from 'ethers';
import { CachedMap, CachedValue } from './cached.js';
import { ABI_CODER } from './utils.js';
import { EVMRequestV1 } from './v1.js';
import { EZCCIP } from '@resolverworks/ezccip';

export const GATEWAY_ABI = new ethers.Interface([
  `function proveRequest(bytes context, tuple(bytes ops, bytes[] inputs)) returns (bytes)`,
  `function getStorageSlots(address target, bytes32[] commands, bytes[] constants) returns (bytes)`,
]);

export class Gateway<
  P extends AbstractProver,
  C extends RollupCommit<P>,
  R extends AbstractRollup<C>,
> extends EZCCIP {
  commitDepth = 3;
  enableHistorical = false;
  private readonly latestCache = new CachedValue(
    () => this.rollup.fetchLatestCommitIndex(),
    60000
  );
  private readonly commitCacheMap = new CachedMap<bigint, C>(Infinity);
  private readonly parentCacheMap = new CachedMap<bigint, bigint>(Infinity);
  readonly callCacheMap = new CachedMap<string, Uint8Array>(Infinity, 1000);
  constructor(readonly rollup: R) {
    super();
    this.register(GATEWAY_ABI, {
      proveRequest: async ([ctx, { ops, inputs }], _context, history) => {
        const commit = await this.getCommit(BigInt(ctx));
        const hash = ethers.solidityPackedKeccak256(
          ['uint256', 'bytes', 'bytes[]'],
          [commit.index, ops, inputs]
        );
        history.show = [commit.index, ethers.hexlify(ops), hash];
        return this.callCacheMap.get(hash, async () => {
          const state = await commit.prover.evalDecoded(ops, inputs);
          const { proofs, order } = await commit.prover.prove(state.needs);
          return ethers.getBytes(
            this.rollup.encodeWitness(commit, proofs, order)
          );
        });
      },
    });
    if (rollup instanceof AbstractRollupV1) {
      const rollupV1 = rollup; // 20240815: tsc bug https://github.com/microsoft/TypeScript/issues/30625
      this.register(GATEWAY_ABI, {
        getStorageSlots: async (
          [target, commands, constants],
          context,
          history
        ) => {
          const commit = await this.getLatestCommit();
          const hash = ethers.id(`${commit.index}:${context.calldata}`);
          history.show = [commit.index, hash];
          return this.callCacheMap.get(hash, async () => {
            const req = new EVMRequestV1(target, commands, constants).v2(); // upgrade v1 to v2
            const state = await commit.prover.evalRequest(req);
            const { proofs, order } = await commit.prover.prove(state.needs);
            const witness = rollupV1.encodeWitnessV1(
              commit,
              proofs[order[0]],
              Array.from(order.subarray(1), (i) => proofs[i])
            );
            return ethers.getBytes(ABI_CODER.encode(['bytes'], [witness]));
          });
        },
      });
    }
  }
  async getLatestCommit() {
    const prev = await this.latestCache.value;
    const next = await this.latestCache.get();
    const commit = await this.cachedCommit(next);
    const max = this.commitDepth + 1;
    if (prev !== next && this.commitCacheMap.cachedSize > max) {
      const old = [...this.commitCacheMap.cachedKeys()].sort().slice(0, -max);
      for (const key of old) {
        this.commitCacheMap.delete(key);
      }
    }
    return commit;
  }
  async getCommit(index?: bigint) {
    let commit = await this.getLatestCommit();
    if (index === undefined) return commit;
    for (let depth = 0; ; ) {
      if (index >= commit.index) return commit;
      if (++depth >= this.commitDepth) break;
      const prevIndex = await this.cachedParentCommitIndex(commit);
      commit = await this.cachedCommit(prevIndex);
    }
    if (this.enableHistorical) {
      return this.commitCacheMap.get(
        index,
        (i) => this.rollup.fetchCommit(i),
        0 // dont cache it
      );
    }
    throw new Error(`too old: ${index}`);
  }
  private async cachedParentCommitIndex(commit: C): Promise<bigint> {
    return this.parentCacheMap.get(commit.index, async () => {
      const index = await this.rollup.fetchParentCommitIndex(commit);
      if (index < 0) throw new Error(`no parent commit: ${commit.index}`);
      return index;
    });
  }
  private async cachedCommit(index: bigint) {
    return this.commitCacheMap.get(index, (i) => this.rollup.fetchCommit(i));
  }
}
