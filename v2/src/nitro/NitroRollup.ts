import {
  AbstractRollupV1,
  type RollupCommit,
  type RollupDeployment,
} from '../rollup.js';
import type { HexAddress, HexString, ProviderPair } from '../types.js';
import type { RPCEthGetBlock } from '../eth/types.js';
import type { ProofSequence, ProofSequenceV1 } from '../vm.js';
import { ZeroHash, Contract, EventLog } from 'ethers';
import {
  CHAIN_MAINNET,
  CHAIN_ARB1,
  CHAIN_ARB_NOVA,
  CHAIN_ARB_SEPOLIA,
  CHAIN_SEPOLIA,
} from '../chains.js';
import { EthProver } from '../eth/EthProver.js';
import { type ABINodeTuple, ROLLUP_ABI } from './types.js';
import { ABI_CODER } from '../utils.js';
import { encodeRlpBlock } from '../rlp.js';

// https://docs.arbitrum.io/how-arbitrum-works/inside-arbitrum-nitro#the-rollup-chain

export type NitroConfig = {
  L2Rollup: HexAddress;
};

export type NitroCommit = RollupCommit<EthProver> & {
  readonly sendRoot: HexString;
  readonly rlpEncodedBlock: HexString;
};

export class NitroRollup extends AbstractRollupV1<NitroCommit> {
  // https://docs.arbitrum.io/build-decentralized-apps/reference/useful-addresses
  static readonly arb1MainnetConfig: RollupDeployment<NitroConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_ARB1,
    L2Rollup: '0x5eF0D09d1E6204141B4d37530808eD19f60FBa35',
  } as const;
  static readonly arbTestnetConfig: RollupDeployment<NitroConfig> = {
    chain1: CHAIN_SEPOLIA,
    chain2: CHAIN_ARB_SEPOLIA,
    L2Rollup: '0xd80810638dbDF9081b72C1B33c65375e807281C8',
  } as const;
  static readonly arbNovaMainnetConfig: RollupDeployment<NitroConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_ARB_NOVA,
    L2Rollup: '0xFb209827c58283535b744575e11953DCC4bEAD88',
  } as const;

  readonly L2Rollup: Contract;
  constructor(providers: ProviderPair, config: NitroConfig) {
    super(providers);
    this.L2Rollup = new Contract(config.L2Rollup, ROLLUP_ABI, this.provider1);
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    return this.L2Rollup.latestConfirmed({
      blockTag: 'finalized',
    });
  }
  override async fetchParentCommitIndex(commit: NitroCommit): Promise<bigint> {
    if (!commit.index) return -1n; // genesis
    const node: ABINodeTuple = await this.L2Rollup.getNode(commit.index);
    return node.prevNum;
  }
  protected override async _fetchCommit(index: bigint): Promise<NitroCommit> {
    const [event] = await this.L2Rollup.queryFilter(
      this.L2Rollup.filters.NodeCreated(index)
    );
    if (!(event instanceof EventLog)) {
      throw new Error(`unknown node index: ${index}`);
    }
    // ethers bug: named abi parsing doesn't propagate through event tuples
    // [4][1][0][0] == event.args.afterState.globalState.bytes32Vals[0];
    const [blockHash, sendRoot] = event.args[4][1][0][0];
    const block: RPCEthGetBlock = await this.provider2.send(
      'eth_getBlockByHash',
      [blockHash, false]
    );
    const rlpEncodedBlock = encodeRlpBlock(block);
    const prover = new EthProver(this.provider2, block.number);
    return { index, prover, sendRoot, rlpEncodedBlock };
  }
  override encodeWitness(
    commit: NitroCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['uint256', 'bytes32', 'bytes', 'bytes[]', 'bytes'],
      [
        commit.index,
        commit.sendRoot,
        commit.rlpEncodedBlock,
        proofSeq.proofs,
        proofSeq.order,
      ]
    );
  }
  override encodeWitnessV1(
    commit: NitroCommit,
    proofSeq: ProofSequenceV1
  ): HexString {
    return ABI_CODER.encode(
      [
        'tuple(bytes32 version, bytes32 sendRoot, uint64 nodeIndex, bytes rlpEncodedBlock)',
        'tuple(bytes, bytes[])',
      ],
      [
        [ZeroHash, commit.sendRoot, commit.index, commit.rlpEncodedBlock],
        [proofSeq.accountProof, proofSeq.storageProofs],
      ]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time is not on-chain
    // the delta between createdAtBlock is a sufficient proxy
    return Math.ceil(sec / 12); // units of L1 blocks
  }
}
