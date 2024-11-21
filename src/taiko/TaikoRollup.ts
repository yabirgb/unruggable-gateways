import {
  AbstractRollup,
  type RollupCommit,
  type RollupDeployment,
} from '../rollup.js';
import type {
  HexAddress,
  HexString,
  HexString32,
  ProviderPair,
  ProofSequence,
} from '../types.js';
import { Contract } from 'ethers/contract';
import { CHAINS } from '../chains.js';
import { EthProver } from '../eth/EthProver.js';
import {
  TAIKO_ABI,
  type ABITaikoConfig,
  type ABITaikoLastSyncedBlock,
} from './types.js';
import { ABI_CODER } from '../utils.js';

// https://github.com/taikoxyz/taiko-mono/tree/main/packages/protocol/contracts
// https://docs.taiko.xyz/network-reference/differences-from-ethereum
// https://status.taiko.xyz/

export type TaikoConfig = {
  TaikoL1: HexAddress;
  // some multiple of the stateRootSyncInternal
  // use 0 to step by 1
  commitBatchSpan: number;
};

export type TaikoCommit = RollupCommit<EthProver> & {
  readonly parentHash: HexString32;
};

export class TaikoRollup extends AbstractRollup<TaikoCommit> {
  // https://docs.taiko.xyz/network-reference/mainnet-addresses
  static readonly mainnetConfig: RollupDeployment<TaikoConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.TAIKO,
    TaikoL1: '0x06a9Ab27c7e2255df1815E6CC0168d7755Feb19a', // based.taiko.eth
    commitBatchSpan: 1,
  };

  static readonly heklaConfig: RollupDeployment<TaikoConfig> = {
    chain1: CHAINS.HOLESKY,
    chain2: CHAINS.TAIKO_HEKLA,
    TaikoL1: '0x79C9109b764609df928d16fC4a91e9081F7e87DB',
    commitBatchSpan: 1,
  };

  static async create(providers: ProviderPair, config: TaikoConfig) {
    const TaikoL1 = new Contract(
      config.TaikoL1,
      TAIKO_ABI,
      providers.provider1
    );
    let commitStep;
    if (config.commitBatchSpan > 0) {
      const cfg: ABITaikoConfig = await TaikoL1.getConfig();
      commitStep = cfg.stateRootSyncInternal * BigInt(config.commitBatchSpan);
    } else {
      commitStep = 1n;
    }
    return new this(providers, TaikoL1, commitStep);
  }
  private constructor(
    providers: ProviderPair,
    readonly TaikoL1: Contract,
    readonly commitStep: bigint
  ) {
    super(providers);
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    // https://github.com/taikoxyz/taiko-mono/blob/main/packages/protocol/contracts/L1/libs/LibUtils.sol
    // by definition this is shouldSyncStateRoot()
    // eg. (block % 16) == 15
    const res: ABITaikoLastSyncedBlock = await this.TaikoL1.getLastSyncedBlock({
      blockTag: this.latestBlockTag,
    });
    return res.blockId;
  }
  protected override async _fetchParentCommitIndex(
    commit: TaikoCommit
  ): Promise<bigint> {
    if (this.commitStep > 1) {
      // remove any unaligned remainder (see above)
      const rem = (commit.index + 1n) % this.commitStep;
      if (rem) return commit.index - rem;
    }
    return commit.index - this.commitStep;
  }
  protected override async _fetchCommit(index: bigint): Promise<TaikoCommit> {
    const prover = new EthProver(this.provider2, index);
    const blockInfo = await prover.fetchBlock();
    return { index, prover, parentHash: blockInfo.parentHash };
  }
  override encodeWitness(
    commit: TaikoCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(uint256, bytes32, bytes[], bytes)'],
      [[commit.index, commit.parentHash, proofSeq.proofs, proofSeq.order]]
    );
  }

  override windowFromSec(sec: number): number {
    // taiko is a based rollup
    const avgBlockSec = 16; // block every block 12-20 sec
    return Math.ceil(sec / avgBlockSec); // units of blocks
  }
}
