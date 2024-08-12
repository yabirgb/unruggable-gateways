import { ethers } from 'ethers';
import type { BigNumberish, EncodedProof, HexString } from '../types.js';
import {
  AbstractCommit,
  AbstractGateway,
  type AbstractGatewayConstructor,
  type GatewayConfig,
} from '../AbstractGateway.js';
import { CachedValue } from '../cached.js';
import { EVMProver } from '../evm/prover.js';
import { CHAIN_MAINNET, CHAIN_SCROLL } from '../chains.js';
import { ABI_CODER } from '../utils.js';
import type { RPCEthGetBlock } from '../evm/types.js';
import { POSEIDON_ABI, ROLLUP_ABI, VERIFIER_ABI } from './types.js';

type Constructor = {
  ScrollChainCommitmentVerifier: HexString;
  ScrollAPIURL: string;
};

class ScrollCommit extends AbstractCommit<EVMProver> {
  constructor(
    index: number,
    prover: EVMProver,
    readonly blockHash: HexString,
    readonly stateRoot: HexString
  ) {
    super(index, prover);
  }
}

export class ScrollGateway extends AbstractGateway<EVMProver, ScrollCommit> {
  // https://docs.scroll.io/en/developers/scroll-contracts/
  static readonly mainnetConfig: GatewayConfig<Constructor> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_SCROLL,
    ScrollChainCommitmentVerifier: '0xC4362457a91B2E55934bDCb7DaaF6b1aB3dDf203',
    ScrollAPIURL: 'https://mainnet-api-re.scroll.io/api/',
    writeCommitMs: 60000, // every minute
    commitStep: 30,
  };
  readonly poseidonCache;
  readonly rollupCache;
  readonly ScrollAPIURL;
  readonly ScrollChainCommitmentVerifier;
  constructor(args: AbstractGatewayConstructor & Constructor) {
    super(args);
    this.ScrollAPIURL = args.ScrollAPIURL;
    this.ScrollChainCommitmentVerifier = new ethers.Contract(
      args.ScrollChainCommitmentVerifier,
      VERIFIER_ABI,
      this.provider1
    );
    this.rollupCache = CachedValue.once(async () => {
      return new ethers.Contract(
        await this.ScrollChainCommitmentVerifier.rollup(),
        ROLLUP_ABI,
        this.provider1
      );
    });
    this.poseidonCache = CachedValue.once(async () => {
      return new ethers.Contract(
        await this.ScrollChainCommitmentVerifier.poseidon(),
        POSEIDON_ABI,
        this.provider1
      );
    });
  }
  override encodeWitness(
    commit: ScrollCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ) {
    return ABI_CODER.encode(
      ['uint256', 'bytes[][]', 'bytes'],
      [commit.index, proofs, order]
    );
  }
  override encodeWitnessV1(
    commit: ScrollCommit,
    accountProof: EncodedProof,
    storageProofs: EncodedProof[]
  ) {
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
      [commit.index, ['0x', compressed]]
    );
  }
  override async fetchLatestCommitIndex(blockDelay: number) {
    // we require the offchain indexer to map commit index to block
    // so we can use the same indexer to get the latested commit
    const res = await fetch(new URL('./last_batch_indexes', this.ScrollAPIURL));
    if (!res.ok) throw new Error(`${res.url}: ${res.status}`);
    const json = await res.json();
    return Number(json.finalized_index) - this.effectiveCommitDelay(blockDelay);
  }
  async fetchBlockFromCommitIndex(index: number) {
    // TODO: determine how to this w/o relying on indexer
    const url = new URL('./batch', this.ScrollAPIURL);
    url.searchParams.set('index', index.toString());
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.url}: ${res.status}`);
    const json = await res.json();
    const {
      batch: { rollup_status, end_block_number },
    } = json;
    if (rollup_status != 'finalized')
      throw new Error(`not finalized: ${rollup_status}`);
    return '0x' + end_block_number.toString(16);
  }
  override async fetchCommit(index: number): Promise<ScrollCommit> {
    const block = await this.fetchBlockFromCommitIndex(index);
    const { stateRoot, hash } = (await this.provider2.send(
      'eth_getBlockByNumber',
      [block, false]
    )) as RPCEthGetBlock;
    return new ScrollCommit(
      index,
      new EVMProver(this.provider2, block, this.makeCommitCache()),
      hash,
      stateRoot
    );
  }
  async poseidonHash(
    a: BigNumberish,
    b: BigNumberish,
    domain: BigNumberish
  ): Promise<HexString> {
    const p = await this.poseidonCache.get();
    return p.poseidon([a, b], domain);
  }
}
