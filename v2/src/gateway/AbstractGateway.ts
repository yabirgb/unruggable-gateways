import type { HexString, Proof, Provider } from '../types.js';
import { ethers } from 'ethers';
import { EZCCIP } from '@resolverworks/ezccip';
import { CachedMap, CachedValue } from '../cached.js';
import { EVMProver } from '../vm.js';
import { EVMRequestV1 } from '../v1.js';

export const ABI_CODER = ethers.AbiCoder.defaultAbiCoder();
export function encodeProofV1(proof: Proof) {
  return ABI_CODER.encode(['bytes[]'], [proof]);
}

export class AbstractCommit {
  cache: CachedMap<string, any> | undefined;
  constructor(
    readonly index: number,
    readonly block: HexString,
    readonly blockHash: HexString
  ) {}
}

export type GatewayConstructor = {
  provider1: Provider;
  provider2: Provider;
  errorRetryMs?: number;
  checkCommitMs?: number;
  writeCommitMs?: number;
  blockDelay?: number;
  commitDepth?: number;
  commitStep?: number;
  commitOffset?: number;
  callCacheSize?: number;
  commitCacheSize?: number;
};

export abstract class AbstractGateway<C extends AbstractCommit> extends EZCCIP {
  readonly provider1;
  readonly provider2;
  readonly writeCommitMs;
  readonly commitStep;
  readonly blockDelay;
  readonly commitOffset;
  readonly callCache: CachedMap<string, Uint8Array>;
  readonly commitCache: CachedMap<number, C>;
  readonly recentCommits: (C | undefined)[];
  readonly latestCache: CachedValue<number>;
  readonly delayedCache: CachedValue<number>;
  readonly commitCacheParams;
  constructor({
    provider1,
    provider2,
    errorRetryMs = 250, // ms to wait to retry actions that failed
    checkCommitMs = 60000, // how frequently to check if rollup has commit
    writeCommitMs = 60 * 60000, // how frequently the rollup actually commits
    commitDepth = 5, // how far back from head to support
    blockDelay = 1, // offset from head for "latest" commit
    commitStep = 1, // index rounding
    commitOffset = 0, // index offset
    callCacheSize = 1000, // typically 5-10KB
    commitCacheSize = 100000, // account and storage proofs <1KB
  }: GatewayConstructor) {
    super();
    this.provider1 = provider1;
    this.provider2 = provider2;
    this.writeCommitMs = writeCommitMs;
    this.commitStep = commitStep;
    this.blockDelay = blockDelay;
    this.commitOffset = commitOffset;
    this.commitCacheParams = {
      cacheMs: Infinity,
      errorMs: errorRetryMs,
      maxCached: commitCacheSize,
    };
    this.latestCache = new CachedValue(
      async () => Number(await this.fetchLatestCommitIndex()),
      checkCommitMs,
      errorRetryMs
    );
    this.delayedCache = new CachedValue(
      async () => Number(await this.fetchDelayedCommitIndex()),
      checkCommitMs,
      errorRetryMs
    );
    this.recentCommits = Array(commitDepth); // circular buffer
    this.commitCache = new CachedMap({
      cacheMs: 0,
      errorMs: errorRetryMs,
      maxCached: 2 * commitDepth,
    }); // inflight commits
    this.callCache = new CachedMap({
      cacheMs: Infinity,
      maxCached: callCacheSize,
    });
    this.register(
      `function proveRequest(bytes context, tuple(bytes ops, bytes[] inputs)) returns (bytes)`,
      async ([ctx, { ops, inputs }], context, history) => {
        // TODO: support (min, max)
        // probably should be a different function
        const index = parseGatewayContext(ctx);
        this.requireAligned(index);
        const hash = ethers.keccak256(context.calldata);
        history.show = [ethers.hexlify(ops), hash];
        return this.callCache.get(hash, async () => {
          const commit = await this.commitFromAligned(index);
          const prover = new EVMProver(
            this.provider2,
            commit.block,
            commit.cache
          );
          const result = await prover.evalDecoded(ops, inputs);
          const { proofs, order } = await prover.prove(result.needs);
          return ethers.getBytes(this.encodeWitness(commit, proofs, order));
        });
      }
    );
    this.register(
      `function getStorageSlots(address target, bytes32[] commands, bytes[] constants) returns (bytes)`,
      async ([target, commands, constants], context, history) => {
        const index = this.alignCommitIndex(await this.delayedCache.get());
        const hash = ethers.id(`${index}:${context.calldata}`);
        history.show = [hash];
        return this.callCache.get(hash, async () => {
          const commit = await this.commitFromAligned(index);
          const prover = new EVMProver(
            this.provider2,
            commit.block,
            commit.cache
          );
          const req = new EVMRequestV1(target, commands, constants).v2(); // upgrade v1 to v2
          const state = await prover.evalRequest(req);
          const { proofs, order } = await prover.prove(state.needs);
          const witness = this.encodeWitnessV1(
            commit,
            proofs[order[0]],
            Array.from(order.subarray(1), (i) => proofs[i])
          );
          return ethers.getBytes(ABI_CODER.encode(['bytes'], [witness]));
        });
      }
    );
  }
  get commitDepth() {
    return this.recentCommits.length;
  }
  get effectiveCommitDelay() {
    return Math.ceil((this.blockDelay * 12000) / this.writeCommitMs);
  }
  get commitParams() {
    const {
      blockDelay,
      effectiveCommitDelay,
      commitStep,
      commitOffset,
      commitDepth,
    } = this;
    return {
      blockDelay,
      effectiveCommitDelay,
      commitStep,
      commitOffset,
      commitDepth,
    };
  }
  protected requireNoStep() {
    if (this.commitStep !== 1) throw new Error('expected step = 1');
    if (this.commitOffset) throw new Error('expected offset = 0');
  }
  shutdown() {
    this.provider1.destroy();
    this.provider2.destroy();
  }
  abstract fetchLatestCommitIndex(): Promise<number>;
  abstract fetchDelayedCommitIndex(): Promise<number>;
  abstract fetchCommit(index: number): Promise<C>;
  abstract encodeWitnessV1(
    commit: C,
    accountProof: Proof,
    storageProofs: Proof[]
  ): HexString;
  abstract encodeWitness(
    commit: C,
    proofs: Proof[],
    order: Uint8Array
  ): HexString;
  // latest aligned commit index (cached)
  async getLatestCommitIndex() {
    return this.alignCommitIndex(await this.latestCache.get());
  }
  async getDelayedCommitIndex() {
    return this.alignCommitIndex(await this.delayedCache.get());
  }
  // latest aligned commit (cached)
  async getLatestCommit() {
    return this.commitFromAligned(await this.getLatestCommitIndex());
  }
  // align a commit index to cachable index
  // (typically the same unless rollup commits frequently, eg. scroll)
  protected alignCommitIndex(index: number) {
    return index - ((index - this.commitOffset) % this.commitStep);
  }
  protected requireAligned(index: number) {
    if (index % this.commitStep !== this.commitOffset) {
      throw new Error(`commit not aligned: ${index}`);
    }
  }
  // translate an aligned commit index to cicular buffer index
  // throws if the index is outside servable bounds
  private async slotFromAligned(index: number) {
    this.requireAligned(index);
    const latest = await this.getLatestCommitIndex();
    if (index > latest) {
      throw new Error(`commit too new: ${index} > ${latest}`);
    }
    const oldest = latest - this.commitStep * this.recentCommits.length;
    if (index < oldest) {
      throw new Error(`commit too old: ${index} < ${oldest}`);
    }
    return Math.floor(index / this.commitStep) % this.recentCommits.length;
  }
  // manage circular buffer
  private async commitFromAligned(index: number) {
    const slot = await this.slotFromAligned(index); // compute circular index
    const commit = this.recentCommits[slot];
    if (commit?.index === index) return commit; // check if latest
    return this.commitCache.get(index, async (index) => {
      const commit = await this.fetchCommit(index); // get newer commit
      const slot = await this.slotFromAligned(index); // check slot again
      commit.cache = new CachedMap(this.commitCacheParams);
      this.recentCommits[slot] = commit; // replace
      return commit;
    });
  }
}

export function parseGatewayContext(context: HexString): number {
  const [index] = ABI_CODER.decode(['uint256'], context);
  return Number(index);
}

export abstract class AbstractGatewayNoV1<
  T extends AbstractCommit,
> extends AbstractGateway<T> {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  override encodeWitnessV1(
    _commit: T,
    _accountProof: Proof,
    _storageProofs: Proof[]
  ): HexString {
    throw new Error('V1 not implemented');
  }
  override fetchDelayedCommitIndex(): Promise<number> {
    throw new Error('V1 not implemented');
  }
}
