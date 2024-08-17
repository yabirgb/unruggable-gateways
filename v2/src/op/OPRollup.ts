import type { RollupDeployment } from '../rollup.js';
import type { HexAddress, ProviderPair } from '../types.js';
import { ethers } from 'ethers';
import { ORACLE_ABI, type ABIOutputProposal } from './types.js';
import { CHAIN_BASE, CHAIN_MAINNET } from '../chains.js';
import { AbstractOPRollup, type OPCommit } from './AbstractOPRollup.js';

export type OPConfig = {
  L2OutputOracle: HexAddress;
};

export class OPRollup extends AbstractOPRollup {
  static readonly baseMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_BASE,
    L2OutputOracle: '0x56315b90c40730925ec5485cf004d835058518A0',
  } as const;

  readonly L2OutputOracle;
  constructor(providers: ProviderPair, config: OPConfig) {
    super(providers);
    this.L2OutputOracle = new ethers.Contract(
      config.L2OutputOracle,
      ORACLE_ABI,
      providers.provider1
    );
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    return this.L2OutputOracle.latestOutputIndex({ blockTag: 'finalized' });
  }
  override async fetchParentCommitIndex(commit: OPCommit): Promise<bigint> {
    return commit.index - 1n;
  }
  override async fetchCommit(index: bigint): Promise<OPCommit> {
    const output: ABIOutputProposal =
      await this.L2OutputOracle.getL2Output(index);
    return this.createCommit(index, '0x' + output.l2BlockNumber.toString(16));
  }

  override windowFromSec(sec: number): number {
    // finalization time is on-chain
    // https://github.com/ethereum-optimism/optimism/blob/a81de910dc2fd9b2f67ee946466f2de70d62611a/packages/contracts-bedrock/src/L1/L2OutputOracle.sol#L231
    return sec;
  }
}
