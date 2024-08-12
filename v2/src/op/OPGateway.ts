import { ethers } from 'ethers';
import type { HexAddress } from '../types.js';
import type { GatewayConfig } from '../AbstractGateway.js';
import {
  AbstractOPGateway,
  type AbstractOPGatewayConstructor,
} from './AbstractOPGateway.js';
import { CHAIN_BASE, CHAIN_MAINNET } from '../chains.js';
import { delayedBlockTag } from '../utils.js';
import { ORACLE_ABI, type ABIOutputProposal } from './types.js';

type Constructor = {
  L2OutputOracle: HexAddress;
};

export class OPGateway extends AbstractOPGateway {
  // https://docs.base.org/docs/base-contracts/#ethereum-mainnet
  static readonly baseMainnetConfig: GatewayConfig<Constructor> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_BASE,
    L2OutputOracle: '0x56315b90c40730925ec5485cf004d835058518A0',
  };
  readonly L2OutputOracle;
  constructor(args: AbstractOPGatewayConstructor & Constructor) {
    super(args);
    this.L2OutputOracle = new ethers.Contract(
      args.L2OutputOracle,
      ORACLE_ABI,
      this.provider1
    );
  }
  override async fetchLatestCommitIndex(blockDelay: number) {
    const blockTag = await delayedBlockTag(this.provider1, blockDelay);
    return Number(await this.L2OutputOracle.latestOutputIndex({ blockTag }));
  }
  override async fetchCommit(index: number) {
    const output = (await this.L2OutputOracle.getL2Output(
      index
    )) as ABIOutputProposal;
    return this.createOPCommit(index, '0x' + output.l2BlockNumber.toString(16));
  }
}
