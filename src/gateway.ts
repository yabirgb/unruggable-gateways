import {
  AbstractRollupV1,
  type RollupCommitType,
  type Rollup,
} from './rollup.js';
import type { HexString } from './types.js';
import { Interface } from 'ethers/abi';
import { solidityPackedKeccak256, id as keccakStr } from 'ethers/hash';
import { getBytes } from 'ethers/utils';
import { keccak256 } from 'ethers/crypto';
import { CachedMap, CachedValue, LRU } from './cached.js';
import { ABI_CODER } from './utils.js';
import { GatewayRequestV1 } from './v1.js';
import { EZCCIP } from '@resolverworks/ezccip';

export const GATEWAY_ABI = new Interface([
  `function proveRequest(bytes context, tuple(bytes ops, bytes[] inputs)) returns (bytes)`,
  `function getStorageSlots(address target, bytes32[] commands, bytes[] constants) returns (bytes)`,
]);

// shorten the request hash for less spam and easier comparision
function shortHash(x: string): string {
  return x.slice(-8);
}

// default number of answers to keep in memory
// (what is the distribution of real-load resolution counts?)
// edit with: gateway.callLRU.max
const callCapacity0 = 1000;
// ms to wait until checking for a new commit
// edit wth: gateway.latestCache.cacheMs
const pollMs0 = 60000;

export class Gateway<R extends Rollup> extends EZCCIP {
  // the max number of non-latest commitments to keep in memory
  commitDepth = 2;
  // if true, requests beyond the commit depth are supported
  allowHistorical = false;
  readonly latestCache = new CachedValue(
    () => this.rollup.fetchLatestCommitIndex(),
    pollMs0
  );
  readonly commitCacheMap = new CachedMap<bigint, RollupCommitType<R>>(
    Infinity
  );
  readonly parentCacheMap = new CachedMap<bigint, bigint>(Infinity);
  readonly callLRU = new LRU<string, Uint8Array>(callCapacity0);
  constructor(readonly rollup: R) {
    super();
    this.register(GATEWAY_ABI, {
      proveRequest: async ([ctx, { ops, inputs }], _context, history) => {
        // given the requested commitment, we answer: min(requested, latest)
        const commit = await this.getRecentCommit(BigInt(ctx.slice(0, 66)));
        // we cannot hash the context.calldata directly because the requested
        // commit might be different, so we hash using the determined commit
        const hash = solidityPackedKeccak256(
          ['uint256', 'bytes', 'bytes[]'],
          [commit.index, ops, inputs]
        );
        history.show = [
          commit.index,
          shortHash(keccak256(ops)), // ops is hashed: function selector
          shortHash(hash), // request is hashed for counting
        ];
        // NOTE: for a given commit + request, calls are pure
        return this.callLRU.cache(hash, async () => {
          const state = await commit.prover.evalDecoded(ops, inputs);
          const proofSeq = await commit.prover.prove(state.needs);
          return getBytes(this.rollup.encodeWitness(commit, proofSeq));
        });
      },
    });
    // NOTE: this only works if V1 and V2 share same proof encoding!
    if (rollup instanceof AbstractRollupV1) {
      const rollupV1 = rollup; // 20240815: tsc bug https://github.com/microsoft/TypeScript/issues/30625
      this.register(GATEWAY_ABI, {
        getStorageSlots: async (
          [target, commands, constants],
          context,
          history
        ) => {
          const commit = await this.getLatestCommit();
          const hash = keccakStr(`${commit.index}:${context.calldata}`);
          history.show = [commit.index, shortHash(hash)];
          return this.callLRU.cache(hash, async () => {
            const req = new GatewayRequestV1(target, commands, constants).v2(); // upgrade v1 to v2
            const state = await commit.prover.evalRequest(req);
            const proofSeq = await commit.prover.proveV1(state.needs);
            const witness = rollupV1.encodeWitnessV1(commit, proofSeq);
            return getBytes(ABI_CODER.encode(['bytes'], [witness]));
          });
        },
      });
    }
  }
  async getLatestCommit() {
    // check if the commit changed
    const prev = await this.latestCache.value;
    const next = await this.latestCache.get();
    const commit = await this.cachedCommit(next);
    const max = this.commitDepth + 1;
    if (prev !== next && this.commitCacheMap.cachedSize > max) {
      // purge the oldest if we have too many
      const old = [...this.commitCacheMap.cachedKeys()].sort().slice(0, -max);
      for (const key of old) {
        this.commitCacheMap.delete(key);
      }
    }
    return commit;
  }
  async getRecentCommit(index: bigint) {
    let commit = await this.getLatestCommit();
    // check recent cache in linear order
    for (let depth = 0; ; ) {
      if (index >= commit.index) return commit;
      if (++depth >= this.commitDepth) break;
      const prevIndex = await this.cachedParentCommitIndex(commit);
      commit = await this.cachedCommit(prevIndex);
    }
    // if older than that, consider one-off commit
    // this can be unaligned but must be finalized
    if (this.allowHistorical) {
      return this.commitCacheMap.get(
        index,
        (i) => this.rollup.fetchCommit(i),
        250 // 20240926: maybe this should be cached for a bit (was 0)
      );
    }
    throw new Error(`too old: ${index}`);
  }
  private cachedParentCommitIndex(
    commit: RollupCommitType<R>
  ): Promise<bigint> {
    return this.parentCacheMap.get(commit.index, () => {
      return this.rollup.fetchParentCommitIndex(commit);
    });
  }
  private cachedCommit(index: bigint) {
    return this.commitCacheMap.get(index, (i) => this.rollup.fetchCommit(i));
  }
}

export abstract class GatewayV1<R extends Rollup> extends EZCCIP {
  latestCommit: RollupCommitType<R> | undefined;
  readonly latestCache = new CachedValue(async () => {
    const index = await this.rollup.fetchLatestCommitIndex();
    // since we can only serve the latest commit
    // we only keep the latest commit
    if (!this.latestCommit || index != this.latestCommit.index) {
      this.latestCommit = await this.rollup.fetchCommit(index);
    }
    return this.latestCommit;
  }, pollMs0);
  readonly callLRU = new LRU<string, Uint8Array>(callCapacity0);
  constructor(readonly rollup: R) {
    super();
    this.register(GATEWAY_ABI, {
      getStorageSlots: async (
        [target, commands, constants],
        context,
        history
      ) => {
        const commit = await this.getLatestCommit();
        const hash = keccakStr(`${commit.index}:${context.calldata}`);
        history.show = [commit.index, shortHash(hash)];
        return this.callLRU.cache(hash, async () => {
          const req = new GatewayRequestV1(target, commands, constants);
          return getBytes(await this.handleRequest(commit, req));
        });
      },
    });
  }
  getLatestCommit() {
    return this.latestCache.get();
  }
  // since every legacy gateway does "its own thing"
  // we forward the responsibility of generating a response
  abstract handleRequest(
    commit: RollupCommitType<R>,
    request: GatewayRequestV1
  ): Promise<HexString>;
}
