import { ZeroHash, Log, getBytes, id as keccakStr, Contract } from 'ethers';
import { CHAIN_MAINNET, CHAIN_POLYGON_POS } from '../chains.js';
import type {
  HexAddress,
  HexString,
  HexString32,
  ProviderPair,
} from '../types.js';
import type { RPCEthGetBlock } from '../eth/types.js';
import { type ABIHeaderTuple, ROOT_CHAIN_ABI } from './types.js';
import type { ProofSequence } from '../vm.js';
import { EthProver } from '../eth/EthProver.js';
import {
  AbstractRollup,
  type RollupCommit,
  type RollupDeployment,
} from '../rollup.js';
import { ABI_CODER } from '../utils.js';
import { encodeRlpBlock } from '../rlp.js';

export type PolygonPoSPoster = {
  readonly address: HexAddress;
  readonly topic1Hash: HexString32;
  readonly blockNumberStart: bigint;
};

export type PolygonPoSConfig = {
  RootChain: HexAddress;
  apiURL: string;
  poster: PolygonPoSPoster;
};

export type PolygonPoSCommit = RollupCommit<EthProver> &
  ABIHeaderTuple & {
    readonly rlpEncodedProof: Uint8Array;
    readonly rlpEncodedBlock: Uint8Array;
  };

function extractPrevBlockHash(event: Log): HexString32 {
  return event.topics[1];
}

export class PolygonPoSRollup extends AbstractRollup<PolygonPoSCommit> {
  // // https://docs.polygon.technology/pos/reference/contracts/genesis-contracts/
  static readonly mainnetConfig: RollupDeployment<PolygonPoSConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_POLYGON_POS,
    RootChain: '0x86E4Dc95c7FBdBf52e33D563BbDB00823894C287',
    apiURL: 'https://proof-generator.polygon.technology/api/v1/matic/',
    poster: {
      // https://polygonscan.com/tx/0x092f9929973fee6a4fa101e9ed45c2b6ce072ac6e2f338f49cac70b41cacbc73
      address: '0x591663413423Dcf7c7806930E642951E0dDdf10B',
      blockNumberStart: 61150865n,
      topic1Hash: keccakStr('NewRoot(bytes32)'),
    },
  } as const;

  readonly apiURL: string;
  readonly RootChain: Contract;
  readonly poster: PolygonPoSPoster;
  constructor(providers: ProviderPair, config: PolygonPoSConfig) {
    super(providers);
    this.apiURL = config.apiURL;
    this.poster = config.poster;
    this.RootChain = new Contract(
      config.RootChain,
      ROOT_CHAIN_ABI,
      this.provider1
    );
  }
  async findPosterEventBefore(l2BlockNumber: bigint, step = 500n) {
    for (let i = l2BlockNumber; i > this.poster.blockNumberStart; i -= step) {
      const logs = await this.provider2.getLogs({
        address: this.poster.address,
        topics: [this.poster.topic1Hash],
        fromBlock: i - step,
        toBlock: i - 1n,
      });
      if (logs.length) return logs[logs.length - 1];
    }
    throw new Error(`unable to find earlier root: ${l2BlockNumber}`);
  }
  async findPosterHeaderBefore(l2BlockNumber: bigint) {
    const event = await this.findPosterEventBefore(l2BlockNumber);
    const prevBlockHash = extractPrevBlockHash(event);
    const blockInfo: RPCEthGetBlock = await this.provider2.send(
      'eth_getBlockByHash',
      [prevBlockHash, false]
    );
    return this.fetchAPIFindHeader(BigInt(blockInfo.number) + 1n);
  }
  async fetchJSON(url: URL) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.url}: HTTP(${res.status})`);
    return res.json();
  }
  async fetchAPIFindHeader(l2BlockNumber: bigint) {
    const url = new URL(`./block-included/${l2BlockNumber}`, this.apiURL);
    const json = await this.fetchJSON(url);
    if (json.error) throw new Error(`Block(${l2BlockNumber}): ${json.message}`);
    const number = BigInt(json.headerBlockNumber);
    const l2BlockNumberStart = BigInt(json.start);
    const l2BlockNumberEnd = BigInt(json.end);
    const rootHash: HexString32 = json.root;
    return {
      number,
      l2BlockNumberStart,
      l2BlockNumberEnd,
      rootHash,
    };
  }
  // async fetchAPIHeaderProof(
  //   l2BlockNumber: bigint,
  //   l2BlockNumberStart: bigint,
  //   l2BlockNumberEnd: bigint
  // ) {
  //   const url = new URL(`./fast-merkle-proof`, this.apiURL);
  //   url.searchParams.set('start', l2BlockNumberStart.toString());
  //   url.searchParams.set('end', l2BlockNumberEnd.toString());
  //   url.searchParams.set('number', l2BlockNumber.toString());
  //   const json = await this.fetchJSON(url);
  //   const v = ethers.getBytes(json.proof);
  //   if (!v.length || v.length & 31) throw new Error('expected bytes32xN');
  //   return Array.from({ length: v.length >> 5 }, (_, i) =>
  //     v.subarray(i << 5, (i + 1) << 5)
  //   );
  // }
  async fetchAPIReceiptProof(txHash: HexString32) {
    const url = new URL(
      `./exit-payload/${txHash}?eventSignature=${this.poster.topic1Hash}`,
      this.apiURL
    );
    const json = await this.fetchJSON(url);
    if (json.error) throw new Error(`receipt proof: ${json.message}`);
    return getBytes(json.result);
  }
  override async fetchLatestCommitIndex(): Promise<bigint> {
    const l2BlockNumberEnd = await this.RootChain.getLastChildBlock({
      blockTag: 'finalized',
    });
    const header = await this.findPosterHeaderBefore(l2BlockNumberEnd + 1n);
    return header.number;
  }
  override async fetchParentCommitIndex(
    commit: PolygonPoSCommit
  ): Promise<bigint> {
    const header = await this.findPosterHeaderBefore(commit.l2BlockNumberStart);
    return header.number;
  }
  protected override async _fetchCommit(
    index: bigint
  ): Promise<PolygonPoSCommit> {
    const { rootHash, l2BlockNumberStart, l2BlockNumberEnd }: ABIHeaderTuple =
      await this.RootChain.headerBlocks(index);
    if (rootHash === ZeroHash) {
      throw new Error(`Commit(${index}) no checkpoint`);
    }
    const events = await this.provider2.getLogs({
      address: this.poster.address,
      topics: [this.poster.topic1Hash],
      fromBlock: l2BlockNumberStart,
      toBlock: l2BlockNumberEnd,
    });
    if (!events.length) throw new Error(`Commit(${index}) no post`);
    const event = events[events.length - 1];
    const prevBlockHash = extractPrevBlockHash(event);
    const [rlpEncodedProof, block] = await Promise.all([
      this.fetchAPIReceiptProof(event.transactionHash),
      this.provider2.send('eth_getBlockByHash', [
        prevBlockHash,
        false,
      ]) as Promise<RPCEthGetBlock>,
    ]);
    const rlpEncodedBlock = getBytes(encodeRlpBlock(block));
    // if (ethers.keccak256(rlpEncodedBlock) !== prevBlockHash) {
    //   throw new Error(`Commit(${index}) hash mismatch`);
    // }
    const prover = new EthProver(this.provider2, block.number);
    return {
      index,
      prover,
      rootHash,
      l2BlockNumberStart,
      l2BlockNumberEnd,
      rlpEncodedProof,
      rlpEncodedBlock,
    };
  }
  override encodeWitness(
    commit: PolygonPoSCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['tuple(bytes, bytes, bytes[], bytes)'],
      [
        [
          commit.rlpEncodedProof,
          commit.rlpEncodedBlock,
          proofSeq.proofs,
          proofSeq.order,
        ],
      ]
    );
  }
  override windowFromSec(sec: number): number {
    // finalization time is on-chain
    return sec;
  }
}
