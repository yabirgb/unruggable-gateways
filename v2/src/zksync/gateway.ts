import {
  ABI_CODER,
  AbstractCommit,
  AbstractGatewayNoV1,
  type GatewayConstructor,
} from '../gateway/AbstractGateway.js';
import { ZKSyncProver } from '../vm.js';
import { ethers } from 'ethers';
import type { HexString, HexString32, EncodedProof } from '../types.js';
import type { RPCZKSyncL1BatchDetails } from '../zksync/types.js';

// https://docs.zksync.io/build/api-reference/zks-rpc
// https://github.com/getclave/zksync-storage-proofs/blob/main/packages/zksync-storage-contracts/src/StorageProofVerifier.sol

type ZKSyncGatewayConstructor = {
  DiamondProxy: HexString;
};

type ABIZKSyncCommitBatchInfo = {
  batchNumber: bigint;
  timestamp: bigint;
  indexRepeatedStorageChanges: bigint;
  newStateRoot: HexString32;
  numberOfLayer1Txs: bigint;
  priorityOperationsHash: HexString32;
  bootloaderHeapInitialContentsHash: HexString32;
  eventsQueueStateHash: HexString32;
  systemLogs: HexString;
  pubdataCommitments: HexString;
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

// https://github.com/matter-labs/era-contracts/blob/main/l1-contracts/contracts/state-transition/chain-interfaces/IGetters.sol
// https://github.com/matter-labs/era-contracts/blob/main/l1-contracts/contracts/state-transition/chain-interfaces/IExecutor.sol
const DIAMOND_ABI = new ethers.Interface([
  `function storedBatchHash(uint256 batchNumber) view returns (bytes32)`,
  `function l2LogsRootHash(uint256 batchNumber) external view returns (bytes32)`,
  'function getTotalBatchesCommitted() view returns (uint256)',
  `function getTotalBatchesVerified() view returns (uint256)`,
  `function getTotalBatchesExecuted() view returns (uint256)`,
  `function commitBatchesSharedBridge(
     uint256 chainId,
     (
      uint64 batchNumber,
      bytes32 batchHash,
      uint64 indexRepeatedStorageChanges,
      uint256 numberOfLayer1Txs,
      bytes32 priorityOperationsHash,
      bytes32 l2LogsTreeRoot,
      uint256 timestamp,
      bytes32 commitment,
    ) lastCommittedBatchData,
    (
      uint64 batchNumber,
      uint64 timestamp,
      uint64 indexRepeatedStorageChanges,
      bytes32 newStateRoot,
      uint256 numberOfLayer1Txs,
      bytes32 priorityOperationsHash,
      bytes32 bootloaderHeapInitialContentsHash,
      bytes32 eventsQueueStateHash,
      bytes systemLogs,
      bytes pubdataCommitments
    )[] newBatchesData
  )`,
  `event BlockCommit(
    uint256 indexed batchNumber,
    bytes32 indexed batchHash,
    bytes32 indexed commitment
  )`,
]);

export class ZKSyncGateway extends AbstractGatewayNoV1<
  ZKSyncProver,
  ZKSyncCommit
> {
  static mainnetConfig() {
    return {
      DiamondProxy: '0x32400084c286cf3e17e7b677ea9583e60a000324',
    };
  }
  readonly DiamondProxy;
  constructor(args: GatewayConstructor & ZKSyncGatewayConstructor) {
    super(args);
    this.DiamondProxy = new ethers.Contract(
      args.DiamondProxy,
      DIAMOND_ABI,
      this.provider1
    );
  }
  override async fetchLatestCommitIndex() {
    return Number(await this.DiamondProxy.getTotalBatchesExecuted()) - 1;
  }
  override async fetchDelayedCommitIndex() {
    const blockTag = (await this.provider1.getBlockNumber()) - this.blockDelay;
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
