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
import {
  CHAIN_MAINNET,
  CHAIN_ARB1,
  CHAIN_ARB_NOVA,
  CHAIN_ARB_SEPOLIA,
  CHAIN_SEPOLIA,
} from '../chains.js';
import { EthProver } from '../eth/EthProver.js';
import { ROLLUP_ABI, type ABINode } from './types.js';
import { ABI_CODER } from '../utils.js';
import { CachedMap } from '../cached.js';
import type { RPCEthGetBlock } from '../eth/types.js';
import { encodeRlpBlock } from '../rlp.js';

// https://docs.arbitrum.io/how-arbitrum-works/inside-arbitrum-nitro#the-rollup-chain

export type NitroConfig = {
  L2Rollup: HexAddress;
};

export type NitroCommit = RollupCommit<EthProver> &
  Readonly<{
    sendRoot: HexString;
    rlpEncodedBlock: HexString;
  }>;

const suggestedWindow = 24;

export class NitroRollup extends AbstractRollup<EthProver, NitroCommit> {
  // https://docs.arbitrum.io/build-decentralized-apps/reference/useful-addresses
  static readonly arb1MainnetConfig: RollupDeployment<NitroConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_ARB1,
    L2Rollup: '0x5eF0D09d1E6204141B4d37530808eD19f60FBa35',
    suggestedWindow,
  } as const;
  static readonly arbTestnetConfig: RollupDeployment<NitroConfig> = {
    chain1: CHAIN_SEPOLIA,
    chain2: CHAIN_ARB_SEPOLIA,
    L2Rollup: '0xd80810638dbDF9081b72C1B33c65375e807281C8',
    suggestedWindow,
  } as const;
  static readonly arbNovaMainnetConfig: RollupDeployment<NitroConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_ARB_NOVA,
    L2Rollup: '0xFb209827c58283535b744575e11953DCC4bEAD88',
    suggestedWindow,
  } as const;
  readonly L2Rollup: ethers.Contract;
  constructor(providers: ProviderPair, config: NitroConfig) {
    super(providers);
    this.L2Rollup = new ethers.Contract(
      config.L2Rollup,
      ROLLUP_ABI,
      this.providers.provider1
    );
  }
  async fetchLatestCommitIndex(): Promise<bigint> {
    return this.L2Rollup.latestConfirmed({
      blockTag: 'finalized',
    });
  }
  async fetchParentCommitIndex(commit: NitroCommit): Promise<bigint> {
    if (!commit.index) return -1n; // genesis
    const node: ABINode = await this.L2Rollup.getNode(commit.index);
    return node.prevNum;
  }
  async fetchCommit(index: bigint): Promise<NitroCommit> {
    const [event] = await this.L2Rollup.queryFilter(
      this.L2Rollup.filters.NodeCreated(index)
    );
    if (!(event instanceof ethers.EventLog)) {
      throw new Error(`unknown node index: ${index}`);
    }
    const { provider2 } = this.providers;
    // ethers bug: named abi parsing doesn't propagate through event tuples
    const [blockHash, sendRoot] = event.args[4][1][0][0]; //event.args.afterState.globalState.bytes32Vals;
    const json: RPCEthGetBlock = await provider2.send('eth_getBlockByHash', [
      blockHash,
      false,
    ]);
    const rlpEncodedBlock = encodeRlpBlock(json);
    return {
      index,
      prover: new EthProver(
        provider2,
        json.number,
        new CachedMap(Infinity, this.commitCacheSize)
      ),
      sendRoot,
      rlpEncodedBlock,
    };
  }
  override encodeWitness(
    commit: NitroCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ): HexString {
    return ABI_CODER.encode(
      ['uint256', 'bytes32', 'bytes', 'bytes[]', 'bytes'],
      [commit.index, commit.sendRoot, commit.rlpEncodedBlock, proofs, order]
    );
  }
  override encodeWitnessV1(
    commit: NitroCommit,
    accountProof: EncodedProof,
    storageProofs: EncodedProof[]
  ): HexString {
    return ABI_CODER.encode(
      [
        'tuple(bytes32 version, bytes32 sendRoot, uint64 nodeIndex, bytes rlpEncodedBlock)',
        'tuple(bytes, bytes[])',
      ],
      [
        [
          ethers.ZeroHash,
          commit.sendRoot,
          commit.index,
          commit.rlpEncodedBlock,
        ],
        accountProof,
        storageProofs,
      ]
    );
  }
}
