import {
  AbstractRollup,
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
import { CHAIN_MAINNET, CHAIN_SCROLL } from '../chains.js';
import { EthProver } from '../eth/EthProver.js';
import { ROLLUP_ABI, VERIFIER_ABI } from './types.js';
import { ABI_CODER } from '../utils.js';
import { CachedMap } from '../cached.js';

export type ScrollConfig = {
  ScrollChainCommitmentVerifier: HexAddress;
  ScrollAPIURL: string;
  blockStep: number;
};

export type ScrollCommit = RollupCommit<EthProver>;

export class ScrollRollup extends AbstractRollup<EthProver, ScrollCommit> {
  // https://docs.scroll.io/en/developers/scroll-contracts/
  static readonly mainnetConfig: RollupDeployment<ScrollConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_SCROLL,
    ScrollChainCommitmentVerifier: '0xC4362457a91B2E55934bDCb7DaaF6b1aB3dDf203',
    ScrollAPIURL: 'https://mainnet-api-re.scroll.io/api/',
    suggestedWindow: 100,
    blockStep: 10,
  } as const;
  static async create(providers: ProviderPair, config: ScrollConfig) {
    const { provider1 } = providers;
    const CommitmentVerifier = new ethers.Contract(
      config.ScrollChainCommitmentVerifier,
      VERIFIER_ABI,
      provider1
    );
    const rollupAddress = await CommitmentVerifier.rollup();
    const rollup = new ethers.Contract(rollupAddress, ROLLUP_ABI, provider1);
    return new this(
      providers,
      CommitmentVerifier,
      rollup,
      config.ScrollAPIURL,
      BigInt(config.blockStep)
    );
  }
  constructor(
    providers: ProviderPair,
    readonly commitmentVerifier: ethers.Contract,
    readonly rollup: ethers.Contract,
    readonly apiURL: string,
    readonly commitStep: bigint
  ) {
    super(providers);
  }
  async fetchLatestBatchIndex(): Promise<bigint> {
    // we require the offchain indexer to map commit index to block
    // so we can use the same indexer to get the latest commit
    const res = await fetch(new URL('./last_batch_indexes', this.apiURL));
    if (!res.ok) throw new Error(`${res.url}: HTTP(${res.status})`);
    const json = await res.json();
    return BigInt(json.finalized_index);
  }
  async fetchBlockFromCommitIndex(index: bigint) {
    // TODO: determine how to this w/o relying on indexer
    const url = new URL('./batch', this.apiURL);
    url.searchParams.set('index', index.toString());
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.url}: HTTP(${res.status})`);
    const json = await res.json();
    const {
      batch: { rollup_status, end_block_number },
    } = json;
    if (rollup_status != 'finalized') {
      throw new Error(
        `Batch(${index}) not finalized: Status(${rollup_status})`
      );
    }
    return '0x' + end_block_number.toString(16);
  }
  override async fetchLatestCommitIndex(): Promise<bigint> {
    const index = await this.fetchLatestBatchIndex();
    return index - (index % this.commitStep);
  }
  override async fetchParentCommitIndex(commit: ScrollCommit): Promise<bigint> {
    const rem = commit.index % this.commitStep;
    if (rem) return commit.index - rem;
    return commit.index - this.commitStep;
  }
  override async fetchCommit(index: bigint): Promise<ScrollCommit> {
    const block = await this.fetchBlockFromCommitIndex(index);
    return {
      index,
      prover: new EthProver(
        this.providers.provider2,
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
      ['tuple(uint256 batchIndex)', 'tuple(bytes, bytes[])'],
      [[commit.index], ['0x', compressed]]
    );
  }
}
