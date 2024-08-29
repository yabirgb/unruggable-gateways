import type {
  HexAddress,
  HexString,
  HexString32,
  ProviderPair,
} from '../types.js';
import { ZKSyncProver } from './ZKSyncProver.js';
import {
  DIAMOND_ABI,
  type ABIZKSyncCommitBatchInfo,
  type RPCZKSyncL1BatchDetails,
} from './types.js';
import { Contract, EventLog } from 'ethers';
import {
  CHAIN_MAINNET,
  CHAIN_SEPOLIA,
  CHAIN_ZKSYNC,
  CHAIN_ZKSYNC_SEPOLIA,
} from '../chains.js';
import {
  type RollupDeployment,
  type RollupCommit,
  AbstractRollup,
} from '../rollup.js';
import { ABI_CODER } from '../utils.js';
import { ProofSequence } from '../vm.js';

// https://docs.zksync.io/zk-stack/concepts/finality
// https://github.com/matter-labs/era-contracts/tree/main/
// https://github.com/getclave/zksync-storage-proofs
// https://uptime.com/statuspage/era

export type ZKSyncConfig = {
  DiamondProxy: HexAddress;
};

export type ZKSyncCommit = RollupCommit<ZKSyncProver> & {
  readonly stateRoot: HexString32;
  readonly abiEncodedBatch: HexString;
};

export class ZKSyncRollup extends AbstractRollup<ZKSyncCommit> {
  // https://docs.zksync.io/build/developer-reference/era-contracts/l1-contracts
  static readonly mainnetConfig: RollupDeployment<ZKSyncConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_ZKSYNC,
    DiamondProxy: '0x32400084c286cf3e17e7b677ea9583e60a000324',
  } as const;
  static readonly testnetConfig: RollupDeployment<ZKSyncConfig> = {
    chain1: CHAIN_SEPOLIA,
    chain2: CHAIN_ZKSYNC_SEPOLIA,
    DiamondProxy: '0x9a6de0f62Aa270A8bCB1e2610078650D539B1Ef9',
  } as const;

  readonly DiamondProxy: Contract;
  constructor(providers: ProviderPair, config: ZKSyncConfig) {
    super(providers);
    this.DiamondProxy = new Contract(
      config.DiamondProxy,
      DIAMOND_ABI,
      this.provider1
    );
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    const count: bigint = await this.DiamondProxy.getTotalBatchesExecuted({
      blockTag: 'finalized',
    });
    return count - 1n;
  }
  override async fetchParentCommitIndex(commit: ZKSyncCommit): Promise<bigint> {
    return commit.index - 1n;
  }
  protected override async _fetchCommit(index: bigint): Promise<ZKSyncCommit> {
    const batchIndex = Number(index);
    const details: RPCZKSyncL1BatchDetails = await this.provider2.send(
      'zks_getL1BatchDetails',
      [batchIndex] // rpc requires number
    );
    // 20240810: this check fails even though the block is finalized
    // if (details.status !== 'verified') {
    //   throw new Error(`not verified: ${details.status}`);
    // }
    const { rootHash, commitTxHash } = details;
    if (!rootHash || !commitTxHash) {
      throw new Error(`Commit(${index}) not finalized`);
    }
    const [tx, [log], l2LogsTreeRoot] = await Promise.all([
      this.provider1.getTransaction(commitTxHash),
      this.DiamondProxy.queryFilter(
        this.DiamondProxy.filters.BlockCommit(index, rootHash)
      ),
      this.DiamondProxy.l2LogsRootHash(index) as Promise<HexString32>,
    ]);
    if (!tx || !(log instanceof EventLog)) {
      throw new Error(`Commit(${index}) no tx: ${commitTxHash}`);
    }
    const commits: ABIZKSyncCommitBatchInfo[] = DIAMOND_ABI.decodeFunctionData(
      'commitBatchesSharedBridge',
      tx.data
    ).newBatchesData;
    const batchInfo = commits.find((x) => x.batchNumber == index);
    if (!batchInfo) {
      throw new Error(`Commit(${index}) not member`);
    }
    const abiEncodedBatch = ABI_CODER.encode(
      [
        'uint64', // batchNumber
        'bytes32', // batchHash
        'uint64', // indexRepeatedStorageChanges
        'uint256', // numberOfLayer1Txs
        'bytes32', // priorityOperationsHash
        'bytes32', // l2LogsTreeRoot
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
    const prover = new ZKSyncProver(this.provider2, batchIndex);
    return {
      index,
      prover,
      stateRoot: rootHash,
      abiEncodedBatch,
    };
  }
  override encodeWitness(
    commit: ZKSyncCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['bytes', 'bytes[]', 'bytes'],
      [commit.abiEncodedBatch, proofSeq.proofs, proofSeq.order]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time not on-chain
    // approximately 1 batch every hour, sequential
    // https://explorer.zksync.io/batches/
    return Math.ceil(sec / 3600); // units of commit index
  }
}
