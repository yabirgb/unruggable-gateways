import {
  AbstractCommit,
  AbstractGatewayNoV1,
  type AbstractGatewayConstructor,
  type GatewayConfig,
} from '../AbstractGateway.js';
import { ZKSyncProver } from './ZKSyncProver.js';
import { ethers } from 'ethers';
import type { HexString, EncodedProof } from '../types.js';
import {
  DIAMOND_ABI,
  type RPCZKSyncL1BatchDetails,
  type ABIZKSyncCommitBatchInfo,
} from './types.js';
import {
  CHAIN_MAINNET,
  CHAIN_SEPOLIA,
  CHAIN_ZKSYNC,
  CHAIN_ZKSYNC_SEPOLIA,
} from '../chains.js';
import { ABI_CODER, delayedBlockTag } from '../utils.js';

// https://docs.zksync.io/build/api-reference/zks-rpc
// https://github.com/getclave/zksync-storage-proofs/blob/main/packages/zksync-storage-contracts/src/StorageProofVerifier.sol

type Constructor = {
  DiamondProxy: HexString;
};

class ZKSyncCommit extends AbstractCommit<ZKSyncProver> {
  constructor(
    index: number,
    prover: ZKSyncProver,
    readonly details: RPCZKSyncL1BatchDetails,
    readonly abiEncodedBatch: HexString
  ) {
    super(index, prover);
  }
}

export class ZKSyncGateway extends AbstractGatewayNoV1<
  ZKSyncProver,
  ZKSyncCommit
> {
  // https://docs.zksync.io/build/developer-reference/era-contracts/l1-contracts
  static readonly mainnetConfig: GatewayConfig<Constructor> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_ZKSYNC,
    DiamondProxy: '0x32400084c286cf3e17e7b677ea9583e60a000324',
  };
  static readonly testnetConfig: GatewayConfig<Constructor> = {
    chain1: CHAIN_SEPOLIA,
    chain2: CHAIN_ZKSYNC_SEPOLIA,
    DiamondProxy: '0x9a6de0f62Aa270A8bCB1e2610078650D539B1Ef9',
  };
  readonly DiamondProxy;
  constructor(args: AbstractGatewayConstructor & Constructor) {
    super(args);
    this.DiamondProxy = new ethers.Contract(
      args.DiamondProxy,
      DIAMOND_ABI,
      this.provider1
    );
  }
  override async fetchLatestCommitIndex(blockDelay: number) {
    const blockTag = await delayedBlockTag(this.provider1, blockDelay);
    return (
      Number(await this.DiamondProxy.getTotalBatchesExecuted({ blockTag })) - 1
    );
  }
  override async fetchCommit(index: number): Promise<ZKSyncCommit> {
    const details: RPCZKSyncL1BatchDetails = await this.provider2.send(
      'zks_getL1BatchDetails',
      [index]
    );
    if (details.status !== 'verified') {
      //throw new Error(`not verified: ${details.status}`);
      console.log(`*** Warning: not verified`, details);
    }
    const hash = details.commitTxHash!;
    const [tx, [log], l2LogsTreeRoot] = await Promise.all([
      this.provider1.getTransaction(hash),
      this.DiamondProxy.queryFilter(
        this.DiamondProxy.filters.BlockCommit(index, details.rootHash)
      ),
      this.DiamondProxy.l2LogsRootHash(index),
    ]);
    if (!tx || !(log instanceof ethers.EventLog)) {
      throw new Error(`unable to find commit tx: ${hash}`);
    }
    const commits: ABIZKSyncCommitBatchInfo[] = DIAMOND_ABI.decodeFunctionData(
      'commitBatchesSharedBridge',
      tx.data
    ).newBatchesData;
    const batchInfo = commits.find((x) => Number(x.batchNumber) === index);
    if (!batchInfo) {
      throw new Error(`expected batch in commit`);
    }
    const encoded = ABI_CODER.encode(
      [
        'uint64', // batchNumber
        'bytes32', // batchHash
        'uint64', // indexRepeatedStorageChanges
        'uint256', // numberOfLayer1Txs
        'bytes32', // priorityOperationsHash
        'bytes32', // l2LogsTreeRoot;
        'uint256', // timestamp
        'bytes32', // commitment
      ],
      [
        batchInfo.batchNumber,
        batchInfo.newStateRoot,
        batchInfo.indexRepeatedStorageChanges,
        batchInfo.numberOfLayer1Txs,
        batchInfo.priorityOperationsHash,
        l2LogsTreeRoot,
        batchInfo.timestamp,
        log.args.commitment,
      ]
    );
    return new ZKSyncCommit(
      index,
      new ZKSyncProver(this.provider2, index, this.makeCommitCache()),
      details,
      encoded
    );
  }
  override encodeWitness(
    commit: ZKSyncCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ): HexString {
    return ABI_CODER.encode(
      ['bytes', 'bytes[]', 'bytes'],
      [commit.abiEncodedBatch, proofs, order]
    );
  }
}
