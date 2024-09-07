import {
  AbstractRollup,
  RollupCommit,
  type RollupDeployment,
} from '../rollup.js';
import type { HexAddress, HexString, ProviderPair } from '../types.js';
import { L1_BLOCK_ABI } from './types.js';
import { Contract, keccak256 } from 'ethers';
import { CHAINS } from '../chains.js';
import { ABI_CODER, toString16 } from '../utils.js';
import { RPCEthGetBlock } from '../eth/types.js';
import { EthProver } from '../eth/EthProver.js';
import { encodeRlpBlock } from '../rlp.js';
import { ProofSequence } from '../vm.js';

export type OPReverseConfig = {
  L1Block?: HexAddress;
};

export type OPReverseCommit = RollupCommit<EthProver> & {
  readonly rlpEncodedBlock: HexString;
};

const L1Block = '0x4200000000000000000000000000000000000015';

export class OPReverseRollup extends AbstractRollup<OPReverseCommit> {
  // https://docs.optimism.io/chain/addresses#op-mainnet-l2
  static readonly mainnetConfig: RollupDeployment<OPReverseConfig> = {
    chain1: CHAINS.OP,
    chain2: CHAINS.MAINNET,
  };
  // https://docs.base.org/docs/base-contracts#base-mainnet
  static readonly baseMainnetConfig: RollupDeployment<OPReverseConfig> = {
    chain1: CHAINS.BASE,
    chain2: CHAINS.MAINNET,
  };

  readonly L1Block: Contract;
  constructor(providers: ProviderPair, config: OPReverseConfig) {
    super(providers);
    this.L1Block = new Contract(
      config.L1Block ?? L1Block,
      L1_BLOCK_ABI,
      this.provider1
    );
  }

  override fetchLatestCommitIndex(): Promise<bigint> {
    // L1Block only stores 1 value
    return this.L1Block.number(); //{ blockTag: this.latestBlockTag });
  }
  protected override async _fetchParentCommitIndex(
    commit: OPReverseCommit
  ): Promise<bigint> {
    return commit.index - 1n;
  }
  protected override async _fetchCommit(
    index: bigint
  ): Promise<OPReverseCommit> {
    const prover = new EthProver(this.provider2, toString16(index));
    const blockInfo: RPCEthGetBlock | null = await this.provider2.send(
      'eth_getBlockByNumber',
      [prover.block, false]
    );
    if (!blockInfo) throw new Error('no block');
    const rlpEncodedBlock = encodeRlpBlock(blockInfo);
    return { index, rlpEncodedBlock, prover };
  }

  override encodeWitness(
    commit: OPReverseCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['bytes', 'bytes[]', 'bytes'],
      [commit.rlpEncodedBlock, proofSeq.proofs, proofSeq.order]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization is not on chain
    // although L1 block time is 12 sec
    // L1Block only stores one value
    // so window is ignored
    return Math.ceil(sec / 12);
  }
}
