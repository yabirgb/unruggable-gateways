import { ethers } from 'ethers';
import type { EncodedProof, HexAddress, HexString32 } from '../types.js';
import {
  AbstractCommit,
  AbstractGatewayNoV1,
  type AbstractGatewayConstructor,
  type GatewayConfig,
} from '../AbstractGateway.js';
import { EVMProver } from '../evm/prover.js';
import { ABI_CODER, delayedBlockTag } from '../utils.js';
import { CHAIN_MAINNET, CHAIN_TAIKO } from '../chains.js';
import type { RPCEthGetBlock } from '../evm/types.js';
import { TAIKO_ABI } from './types.js';

type Constructor = {
  TaikoL1: HexAddress;
};

class TaikoCommit extends AbstractCommit<EVMProver> {
  constructor(
    index: number,
    prover: EVMProver,
    readonly parentHash: HexString32
  ) {
    super(index, prover);
  }
}

export class TaikoGateway extends AbstractGatewayNoV1<EVMProver, TaikoCommit> {
  static mainnetConfig(alignMs = 15 * 60000): GatewayConfig<Constructor> {
    // alignMs is a free parameter, 5-60 minutes seems reasonable
    // getConfig().stateRootSyncInternal
    const syncInternal = 16;
    // https://docs.taiko.xyz/network-reference/differences-from-ethereum
    // every block 12-20 sec
    const averageBlockMs = 16000;
    // multiple of syncInterval to approximate alignMs
    const commitStep =
      syncInternal * Math.round(alignMs / averageBlockMs / syncInternal);
    return {
      chain1: CHAIN_MAINNET,
      chain2: CHAIN_TAIKO,
      // https://docs.taiko.xyz/network-reference/mainnet-addresses
      // https://etherscan.io/address/based.taiko.eth
      TaikoL1: '0x06a9Ab27c7e2255df1815E6CC0168d7755Feb19a',
      writeCommitMs: averageBlockMs,
      commitStep,
      // https://github.com/taikoxyz/taiko-mono/blob/main/packages/protocol/contracts/L1/libs/LibUtils.sol
      commitOffset: commitStep - 1, // shouldSyncStateRoot() on last
    };
  }
  readonly TaikoL1;
  constructor(args: AbstractGatewayConstructor & Constructor) {
    super(args);
    this.TaikoL1 = new ethers.Contract(args.TaikoL1, TAIKO_ABI, this.provider1);
  }
  override encodeWitness(
    commit: TaikoCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ) {
    return ABI_CODER.encode(
      ['uint256', 'bytes32', 'bytes[]', 'bytes'],
      [commit.index, commit.parentHash, proofs, order]
    );
  }
  override async fetchLatestCommitIndex(blockDelay: number) {
    const blockTag = await delayedBlockTag(this.TaikoL1, blockDelay);
    const { blockId } = await this.TaikoL1.getLastSyncedBlock({ blockTag });
    return Number(blockId);
  }
  override async fetchCommit(index: number): Promise<TaikoCommit> {
    const block = '0x' + index.toString(16);
    const { parentHash } = (await this.provider2.send('eth_getBlockByNumber', [
      block,
      false,
    ])) as RPCEthGetBlock;
    return new TaikoCommit(
      index,
      new EVMProver(this.provider2, block, this.makeCommitCache()),
      parentHash
    );
  }
}
