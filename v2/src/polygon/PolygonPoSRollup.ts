import { ethers } from 'ethers';
import { CHAIN_MAINNET, CHAIN_POLYGON_POS } from '../chains.js';
import { EthProver } from '../eth/EthProver.js';
import {
  AbstractRollup,
  RollupCommit,
  type RollupDeployment,
} from '../rollup.js';
import {
  EncodedProof,
  HexAddress,
  HexString,
  HexString32,
  ProviderPair,
} from '../types.js';
import { ROOT_CHAIN_PROXY_ABI } from './types.js';
import { ABI_CODER } from '../utils.js';

export type PolygonPoSConfig = {
  RootChainProxy: HexAddress;
  apiURL: string;
};

export type PolygonPoSCommit = RollupCommit<EthProver> & {
  readonly start: bigint;
  readonly root: HexString32;
};

export class PolygonPoSRollup extends AbstractRollup<PolygonPoSCommit> {
  // // https://docs.polygon.technology/pos/reference/contracts/genesis-contracts/
  static readonly mainnetConfig: RollupDeployment<PolygonPoSConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_POLYGON_POS,
    RootChainProxy: '0x86E4Dc95c7FBdBf52e33D563BbDB00823894C287',
    apiURL: 'https://proof-generator.polygon.technology',
  };
  // api/v1/matic/fast-merkle-proof

  readonly apiURL: string;
  readonly RootChainProxy: ethers.Contract;
  constructor(providers: ProviderPair, config: PolygonPoSConfig) {
    super(providers);
    this.apiURL = config.apiURL;
    this.RootChainProxy = new ethers.Contract(
      config.RootChainProxy,
      ROOT_CHAIN_PROXY_ABI,
      this.provider1
    );
  }

  override fetchLatestCommitIndex(): Promise<bigint> {
    return this.RootChainProxy.getLastChildBlock({ blockTag: 'finalized' });
  }
  override async fetchParentCommitIndex(commit: PolygonPoSCommit) {
    // const [event] = await this.RootChainProxy.queryFilter(
    // 	this.RootChainProxy.filters.NewHeaderBlock(index)
    //   );
    //   if (!(event instanceof ethers.EventLog)) {
    // 	throw new Error(`unknown node index: ${index}`);
    //   }
    const { start } = await this.fetchAPIFindBlock(commit.start);
    return start - 1n;
  }
  async fetchAPIFindBlock(l2BlockNumber: bigint) {
    const url = new URL(
      `./api/v1/matic/block-included/${l2BlockNumber}`,
      this.apiURL
    );
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.url}: HTTP(${res.status})`);
    const json = await res.json();
    if (json.error) throw new Error(`Block(${l2BlockNumber}): ${json.message}`);
    const header = BigInt(json.headerBlockNumber);
    const start = BigInt(json.start);
    const end = BigInt(json.end);
    const root: HexString32 = json.root;
    return { header, start, end, root };
  }
  override async fetchCommit(index: bigint) {
    const { start, end, root } = await this.fetchAPIFindBlock(index);
    if (index != end) throw new Error(`Block(${index}) is not end`);
    const prover = new EthProver(this.provider2, '0x' + index.toString(16));
    this.configureProver(prover);
    return { index, start, root, prover };
  }
  override encodeWitness(
    commit: PolygonPoSCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ): HexString {
    return ABI_CODER.encode(
      ['uint256', 'bytes[]', 'bytes'],
      [commit.index, proofs, order]
    );
  }
  override windowFromSec(sec: number): number {
    // finalization time is on-chain
    return sec;
  }
}
