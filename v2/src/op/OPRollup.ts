import type { RollupDeployment } from '../rollup.js';
import type { HexAddress, ProviderPair } from '../types.js';
import { type ABIOutputProposal, ORACLE_ABI } from './types.js';
import { Contract } from 'ethers';
import { CHAINS } from '../chains.js';
import { AbstractOPRollup, type OPCommit } from './AbstractOPRollup.js';
import { toString16 } from '../utils.js';

export type OPConfig = {
  L2OutputOracle: HexAddress;
};

export class OPRollup extends AbstractOPRollup {
  // https://docs.base.org/docs/base-contracts#base-mainnet
  static readonly baseMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.BASE,
    L2OutputOracle: '0x56315b90c40730925ec5485cf004d835058518A0',
  };

  // https://docs.blast.io/building/contracts#mainnet
  static readonly blastMainnnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.BLAST,
    L2OutputOracle: '0x826D1B0D4111Ad9146Eb8941D7Ca2B6a44215c76',
  };

  // https://docs.frax.com/fraxtal/addresses/fraxtal-contracts#mainnet
  static readonly fraxtalMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.FRAXTAL,
    L2OutputOracle: '0x66CC916Ed5C6C2FA97014f7D1cD141528Ae171e4',
  };

  // https://docs.zora.co/zora-network/network#zora-network-mainnet-1
  static readonly zoraMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.ZORA,
    L2OutputOracle: '0x9E6204F750cD866b299594e2aC9eA824E2e5f95c',
  };

  readonly L2OutputOracle;
  constructor(providers: ProviderPair, config: OPConfig) {
    super(providers);
    this.L2OutputOracle = new Contract(
      config.L2OutputOracle,
      ORACLE_ABI,
      providers.provider1
    );
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    return this.L2OutputOracle.latestOutputIndex({
      blockTag: this.latestBlockTag,
    });
  }
  protected override async _fetchParentCommitIndex(
    commit: OPCommit
  ): Promise<bigint> {
    return commit.index - 1n;
  }
  protected override async _fetchCommit(index: bigint) {
    const output: ABIOutputProposal =
      await this.L2OutputOracle.getL2Output(index);
    return this.createCommit(index, toString16(output.l2BlockNumber));
  }

  override windowFromSec(sec: number): number {
    // finalization time is on-chain
    // https://github.com/ethereum-optimism/optimism/blob/a81de910dc2fd9b2f67ee946466f2de70d62611a/packages/contracts-bedrock/src/L1/L2OutputOracle.sol#L231
    return sec;
  }
}
