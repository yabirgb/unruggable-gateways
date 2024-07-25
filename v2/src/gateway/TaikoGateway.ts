import { ethers } from 'ethers';
import type { HexString, Proof, RPCEthGetBlock } from '../types.js';
import {
  AbstractCommit,
  AbstractGatewayNoV1,
  ABI_CODER,
  type GatewayConstructor,
} from './AbstractGateway.js';

type TaikoGatewayConstructor = {
  TaikoL1: HexString;
};

class TaikoCommit extends AbstractCommit {
  constructor(
    index: number,
    block: HexString,
    blockHash: HexString,
    readonly stateRoot: HexString,
    readonly parentHash: HexString
  ) {
    super(index, block, blockHash);
  }
}

export class TaikoGateway extends AbstractGatewayNoV1<TaikoCommit> {
  static mainnetConfig(alignMs = 15 * 60000) {
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
      // https://docs.taiko.xyz/network-reference/mainnet-addresses
      // https://etherscan.io/address/based.taiko.eth
      TaikoL1: '0x06a9Ab27c7e2255df1815E6CC0168d7755Feb19a',
      writeCommitMs: averageBlockMs,
      commitStep,
      // https://github.com/taikoxyz/taiko-mono/blob/main/packages/protocol/contracts/L1/libs/LibUtils.sol
      commitOffset: commitStep - 1, // shouldSyncStateRoot() on last
    };
  }
  static mainnet(a: GatewayConstructor) {
    return new this({ ...this.mainnetConfig(), ...a });
  }
  readonly TaikoL1: ethers.Contract;
  constructor(args: GatewayConstructor & TaikoGatewayConstructor) {
    super(args);
    this.TaikoL1 = new ethers.Contract(
      args.TaikoL1,
      [
        'function getLastSyncedBlock() view returns (uint64 blockId, bytes32 blockHash, bytes32 stateRoot)',
        'function getLastVerifiedBlock() view returns (uint64 blockId, bytes32 blockHash, bytes32 stateRoot)',
        `function getConfig() view returns (tuple(
          uint64 chainId,
          uint64 blockMaxProposals,
          uint64 blockRingBufferSize,
          uint64 maxBlocksToVerify,
          uint32 blockMaxGasLimit,
          uint96 livenessBond,
          uint8 stateRootSyncInternal,
          bool checkEOAForCalldataDA
        ))`,
      ],
      this.provider1
    );
  }
  override encodeWitness(
    commit: TaikoCommit,
    proofs: Proof[],
    order: Uint8Array
  ) {
    return ABI_CODER.encode(
      ['bytes32', 'bytes[][]', 'bytes'],
      [commit.parentHash, proofs, order]
    );
  }
  override async fetchLatestCommitIndex() {
    const { blockId } = await this.TaikoL1.getLastSyncedBlock();
    return Number(blockId);
  }
  override async fetchCommit(index: number): Promise<TaikoCommit> {
    const block = '0x' + index.toString(16);
    const { hash, stateRoot, parentHash } = (await this.provider2.send(
      'eth_getBlockByNumber',
      [block, false]
    )) as RPCEthGetBlock;
    return new TaikoCommit(index, block, hash, stateRoot, parentHash);
  }
}
