import {
  AbstractRollupV1,
  type RollupCommit,
  type RollupDeployment,
} from '../rollup.js';
import type {
  EncodedProof,
  HexAddress,
  HexString,
  ProviderPair,
} from '../types.js';
import { ethers } from 'ethers';
import {
  CHAIN_MAINNET,
  CHAIN_SCROLL,
  CHAIN_SCROLL_SEPOLIA,
  CHAIN_SEPOLIA,
} from '../chains.js';
import { EthProver } from '../eth/EthProver.js';
import { POSEIDON_ABI, ROLLUP_ABI, VERIFIER_ABI } from './types.js';
import { ABI_CODER } from '../utils.js';
import { CachedMap } from '../cached.js';

// https://github.com/scroll-tech/scroll-contracts/
// https://docs.scroll.io/en/developers/ethereum-and-scroll-differences/
// https://status.scroll.io/

export type ScrollConfig = {
  ScrollChainCommitmentVerifier: HexAddress;
  apiURL: string;
  commitStep: number;
};

export type ScrollCommit = RollupCommit<EthProver>;

// 20240815: commits are approximately every minute
// to make caching useful, we align to a step
// note: use 1 to disable the alignment
const commitStep = 15; // effectively minutes

export class ScrollRollup extends AbstractRollupV1<ScrollCommit> {
  // https://docs.scroll.io/en/developers/scroll-contracts/
  static readonly mainnetConfig: RollupDeployment<ScrollConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_SCROLL,
    ScrollChainCommitmentVerifier: '0xC4362457a91B2E55934bDCb7DaaF6b1aB3dDf203',
    apiURL: 'https://mainnet-api-re.scroll.io/api/',
    commitStep,
  } as const;
  static readonly testnetConfig: RollupDeployment<ScrollConfig> = {
    chain1: CHAIN_SEPOLIA,
    chain2: CHAIN_SCROLL_SEPOLIA,
    ScrollChainCommitmentVerifier: '0x64cb3A0Dcf43Ae0EE35C1C15edDF5F46D48Fa570',
    apiURL: 'https://sepolia-api-re.scroll.io/api/',
    commitStep,
  } as const;

  static async create(providers: ProviderPair, config: ScrollConfig) {
    const CommitmentVerifier = new ethers.Contract(
      config.ScrollChainCommitmentVerifier,
      VERIFIER_ABI,
      providers.provider1
    );
    const [rollupAddress, poseidonAddress] = await Promise.all([
      CommitmentVerifier.rollup() as Promise<HexAddress>,
      CommitmentVerifier.poseidon() as Promise<HexAddress>,
    ]);
    const rollup = new ethers.Contract(
      rollupAddress,
      ROLLUP_ABI,
      providers.provider1
    );
    const poseidon = new ethers.Contract(
      poseidonAddress,
      POSEIDON_ABI,
      providers.provider1
    );
    return new this(
      providers,
      CommitmentVerifier,
      config.apiURL,
      BigInt(config.commitStep),
      rollup,
      poseidon
    );
  }
  private constructor(
    providers: ProviderPair,
    readonly CommitmentVerifier: ethers.Contract,
    readonly apiURL: string,
    readonly commitStep: bigint,
    readonly rollup: ethers.Contract,
    readonly poseidon: ethers.Contract
  ) {
    super(providers);
  }

  async fetchAPILatestCommitIndex(): Promise<bigint> {
    // we require the offchain indexer to map commit index to block
    // so we can use the same indexer to get the latest commit
    const res = await fetch(new URL('./last_batch_indexes', this.apiURL));
    if (!res.ok) throw new Error(`${res.url}: HTTP(${res.status})`);
    const json = await res.json();
    return BigInt(json.finalized_index);
  }
  async fetchAPIBlockFromCommitIndex(index: bigint) {
    // TODO: determine how to this w/o relying on indexer
    const url = new URL('./batch', this.apiURL);
    url.searchParams.set('index', index.toString());
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.url}: HTTP(${res.status})`);
    const json = await res.json();
    const {
      batch: { rollup_status, end_block_number },
    } = json;
    if (rollup_status !== 'finalized') {
      throw new Error(
        `Batch(${index}) not finalized: Status(${rollup_status})`
      );
    }
    return '0x' + end_block_number.toString(16);
  }
  override async fetchLatestCommitIndex(): Promise<bigint> {
    const index = await this.fetchAPILatestCommitIndex();
    return index - (index % this.commitStep); // align to commit step
  }
  override async fetchParentCommitIndex(commit: ScrollCommit): Promise<bigint> {
    // [0, index] is finalized
    // https://github.com/scroll-tech/scroll/blob/738c85759d0248c005469972a49fc983b031ff1c/contracts/src/L1/rollup/ScrollChain.sol#L228
    const rem = commit.index % this.commitStep;
    if (rem) return commit.index - rem; // if not aligned, align to step
    return commit.index - this.commitStep; // else, use previous step
  }
  override async fetchCommit(index: bigint): Promise<ScrollCommit> {
    const block = await this.fetchAPIBlockFromCommitIndex(index);
    return {
      index,
      prover: new EthProver(
        this.provider2,
        block,
        new CachedMap(Infinity, this.commitCacheSize)
      ),
    };
  }
  override encodeWitness(
    commit: ScrollCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ): HexString {
    return ABI_CODER.encode(
      ['uint256', 'bytes[]', 'bytes'],
      [commit.index, proofs, order]
    );
  }
  override encodeWitnessV1(
    commit: ScrollCommit,
    accountProof: EncodedProof,
    storageProofs: EncodedProof[]
  ): HexString {
    const compressed = storageProofs.map((storageProof) =>
      ethers.concat([
        ethers.toBeHex(accountProof.length, 1),
        ...accountProof,
        ethers.toBeHex(storageProof.length, 1),
        ...storageProof,
      ])
    );
    return ABI_CODER.encode(
      ['tuple(uint256)', 'tuple(bytes, bytes[])'],
      [[commit.index], ['0x', compressed]]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time is not on-chain
    const step = Number(this.commitStep);
    const count = sec / 60; // every minute (see above: "commitStep")
    return step * Math.ceil(count / step); // units of commit index
  }
}
