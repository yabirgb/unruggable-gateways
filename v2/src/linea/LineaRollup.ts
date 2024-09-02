import { ZeroHash, Contract } from 'ethers';
import type {
  HexAddress,
  HexString,
  HexString32,
  ProviderPair,
} from '../types.js';
import type { ProofSequence } from '../vm.js';
import { LineaProver } from './LineaProver.js';
import { ROLLUP_ABI } from './types.js';
import { CHAINS } from '../chains.js';
import {
  type RollupDeployment,
  type RollupCommit,
  AbstractRollup,
} from '../rollup.js';
import { ABI_CODER, toString16 } from '../utils.js';

// https://docs.linea.build/developers/quickstart/ethereum-differences
// https://github.com/Consensys/linea-contracts
// https://consensys.io/diligence/audits/2024/06/linea-ens/
// https://github.com/Consensys/linea-monorepo/blob/main/contracts/test/SparseMerkleProof.ts
// https://github.com/Consensys/linea-ens/blob/main/packages/linea-state-verifier/contracts/LineaSparseProofVerifier.sol

export type LineaConfig = {
  L1MessageService: HexAddress;
  SparseMerkleProof: HexAddress;
};

export type LineaCommit = RollupCommit<LineaProver> & {
  readonly stateRoot: HexString32;
};

export class LineaRollup extends AbstractRollup<LineaCommit> {
  // https://docs.linea.build/developers/quickstart/info-contracts
  static readonly mainnetConfig: RollupDeployment<LineaConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.LINEA,
    L1MessageService: '0xd19d4B5d358258f05D7B411E21A1460D11B0876F',
    // https://github.com/Consensys/linea-ens/blob/main/packages/linea-ens-resolver/deployments/mainnet/SparseMerkleProof.json
    SparseMerkleProof: '0xBf8C454Af2f08fDD90bB7B029b0C2c07c2a7b4A3',
  };
  static readonly testnetConfig: RollupDeployment<LineaConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.LINEA_SEPOLIA,
    L1MessageService: '0xB218f8A4Bc926cF1cA7b3423c154a0D627Bdb7E5',
    // https://github.com/Consensys/linea-ens/blob/main/packages/linea-ens-resolver/deployments/sepolia/SparseMerkleProof.json
    SparseMerkleProof: '0x718D20736A637CDB15b6B586D8f1BF081080837f',
  };

  readonly L1MessageService: Contract;
  constructor(providers: ProviderPair, config: LineaConfig) {
    super(providers);
    this.L1MessageService = new Contract(
      config.L1MessageService,
      ROLLUP_ABI,
      this.provider1
    );
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    return this.L1MessageService.currentL2BlockNumber({
      blockTag: this.latestBlockTag,
    });
  }
  protected override async _fetchParentCommitIndex(
    commit: LineaCommit
  ): Promise<bigint> {
    // find the starting state root
    const [event] = await this.L1MessageService.queryFilter(
      this.L1MessageService.filters.DataFinalized(
        commit.index,
        null,
        commit.stateRoot
      )
    );
    if (!event) throw new Error('no DataFinalized event');
    // find the block that finalized this root
    const prevStateRoot = event.topics[2];
    const [prevEvent] = await this.L1MessageService.queryFilter(
      this.L1MessageService.filters.DataFinalized(null, null, prevStateRoot)
    );
    if (!prevEvent) throw new Error('no prior DataFinalized event');
    return BigInt(prevEvent.topics[1]); // l2BlockNumber
  }
  protected override async _fetchCommit(index: bigint): Promise<LineaCommit> {
    const stateRoot: HexString32 =
      await this.L1MessageService.stateRootHashes(index);
    if (stateRoot === ZeroHash) throw new Error('not finalized');
    const prover = new LineaProver(this.provider2, toString16(index));
    return { index, stateRoot, prover };
  }
  override encodeWitness(
    commit: LineaCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['uint256', 'bytes[]', 'bytes'],
      [commit.index, proofSeq.proofs, proofSeq.order]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time is not on-chain
    // https://docs.linea.build/developers/guides/bridge/how-to-bridge-eth#bridge-eth-from-linea-mainnet-l2-to-ethereum-mainnet-l1
    // "Reminder: It takes at least 8 hours for the transaction to go through from L2 to L1."
    // 20240815: heuristic based on mainnet data
    // https://etherscan.io/advanced-filter?tadd=0x1335f1a2b3ff25f07f5fef07dd35d8fb4312c3c73b138e2fad9347b3319ab53c&ps=25&eladd=0xd19d4B5d358258f05D7B411E21A1460D11B0876F&eltpc=0x1335f1a2b3ff25f07f5fef07dd35d8fb4312c3c73b138e2fad9347b3319ab53c
    const blocksPerCommit = 5000; // every 2000-8000+ L2 blocks
    const secPerCommit = 2 * 3600; // every ~2 hours
    return blocksPerCommit * Math.ceil(sec / secPerCommit); // units of commit
  }
}
