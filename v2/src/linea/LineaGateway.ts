import { ethers } from 'ethers';
import {
  AbstractCommit,
  AbstractGatewayNoV1,
  type AbstractGatewayConstructor,
  type GatewayConfig,
} from '../AbstractGateway.js';
import {
  CHAIN_LINEA,
  CHAIN_LINEA_SEPOLIA,
  CHAIN_MAINNET,
  CHAIN_SEPOLIA,
} from '../chains.js';
import type { EncodedProof, HexAddress, Provider } from '../types.js';
import { L1_ABI } from './types.js';
import { ABI_CODER, delayedBlockTag } from '../utils.js';
import { LineaProver } from './LineaProver.js';

// https://consensys.io/diligence/audits/2024/06/linea-ens/
// https://github.com/Consensys/linea-ens/blob/main/packages/linea-state-verifier/contracts/LineaSparseProofVerifier.sol
// https://github.com/Consensys/linea-monorepo/blob/main/contracts/test/SparseMerkleProof.ts

class LineaCommit extends AbstractCommit<LineaProver> {
  constructor(index: number, prover: LineaProver) {
    super(index, prover);
  }
}

type Constructor = {
  L1MessageService: HexAddress;
};

type ExternalLibs = {
  SparseMerkleProof: HexAddress;
};

export class LineaGateway extends AbstractGatewayNoV1<
  LineaProver,
  AbstractCommit<LineaProver>
> {
  // https://docs.linea.build/developers/quickstart/info-contracts
  static readonly mainnetConfig: GatewayConfig<Constructor> & ExternalLibs = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_LINEA,
    L1MessageService: '0xd19d4B5d358258f05D7B411E21A1460D11B0876F',
    SparseMerkleProof: '0xBf8C454Af2f08fDD90bB7B029b0C2c07c2a7b4A3',
  };
  static readonly testnetConfig: GatewayConfig<Constructor> = {
    chain1: CHAIN_SEPOLIA,
    chain2: CHAIN_LINEA_SEPOLIA,
    L1MessageService: '0xB218f8A4Bc926cF1cA7b3423c154a0D627Bdb7E5',
  };
  // linea doesn't support finalized blockTag
  static async latestBlock(provider: Provider, L1MessageService: HexAddress) {
    const rollup = new ethers.Contract(L1MessageService, L1_ABI, provider);
    const block = await rollup.currentL2BlockNumber({ blockTag: 'finalized' });
    return '0x' + block.toString(16);
  }
  readonly L1MessageService;
  constructor(args: AbstractGatewayConstructor & Constructor) {
    super(args);
    this.L1MessageService = new ethers.Contract(
      args.L1MessageService,
      L1_ABI,
      this.provider1
    );
  }
  async fetchLatestCommitIndex(blockDelay: number) {
    const blockTag = await delayedBlockTag(this.provider1, blockDelay);
    return Number(
      await this.L1MessageService.currentL2BlockNumber({ blockTag })
    );
  }
  async fetchCommit(index: number): Promise<LineaCommit> {
    return new AbstractCommit(
      index,
      new LineaProver(this.provider2, '0x' + index.toString(16))
    );
  }
  encodeWitness(
    commit: LineaCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ) {
    return ABI_CODER.encode(
      ['uint256', 'bytes[]', 'bytes'],
      [commit.index, proofs, order]
    );
  }
}
