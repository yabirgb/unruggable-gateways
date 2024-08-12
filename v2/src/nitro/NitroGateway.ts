import type { EncodedProof, HexString } from '../types.js';
import type { RPCEthGetBlock } from '../evm/types.js';
import { ethers } from 'ethers';
import {
  AbstractCommit,
  AbstractGateway,
  type AbstractGatewayConstructor,
  type GatewayConfig,
} from '../AbstractGateway.js';
import { encodeRlpBlock } from '../rlp.js';
import { EVMProver } from '../evm/prover.js';
import {
  CHAIN_ARB1,
  CHAIN_ARB_NOVA,
  CHAIN_ARB_SEPOLIA,
  CHAIN_MAINNET,
  CHAIN_SEPOLIA,
} from '../chains.js';
import { ABI_CODER, delayedBlockTag } from '../utils.js';
import { ROLLUP_ABI } from './types.js';

type Constructor = {
  L2Rollup: HexString;
};

class NitroCommit extends AbstractCommit<EVMProver> {
  constructor(
    index: number,
    prover: EVMProver,
    readonly blockHash: HexString,
    readonly sendRoot: HexString,
    readonly rlpEncodedBlock: HexString
  ) {
    super(index, prover);
  }
}

export class NitroGateway extends AbstractGateway<EVMProver, NitroCommit> {
  // https://docs.arbitrum.io/build-decentralized-apps/reference/useful-addresses
  static readonly arb1MainnetConfig: GatewayConfig<Constructor> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_ARB1,
    L2Rollup: '0x5eF0D09d1E6204141B4d37530808eD19f60FBa35',
  };
  static readonly arbNovaMainnetConfig: GatewayConfig<Constructor> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_ARB_NOVA,
    L2Rollup: '0xFb209827c58283535b744575e11953DCC4bEAD88',
  };
  static readonly arbTestnetConfig: GatewayConfig<Constructor> = {
    chain1: CHAIN_SEPOLIA,
    chain2: CHAIN_ARB_SEPOLIA,
    L2Rollup: '0xd80810638dbDF9081b72C1B33c65375e807281C8',
  };
  readonly L2Rollup: ethers.Contract;
  constructor(args: AbstractGatewayConstructor & Constructor) {
    super(args);
    this.L2Rollup = new ethers.Contract(
      args.L2Rollup,
      ROLLUP_ABI,
      this.provider1
    );
  }
  override encodeWitness(
    commit: NitroCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ) {
    return ABI_CODER.encode(
      ['uint256', 'bytes32', 'bytes', 'bytes[]', 'bytes'],
      [commit.index, commit.sendRoot, commit.rlpEncodedBlock, proofs, order]
    );
  }
  override encodeWitnessV1(
    commit: NitroCommit,
    accountProof: EncodedProof,
    storageProofs: EncodedProof[]
  ) {
    return ABI_CODER.encode(
      [
        'tuple(bytes32 version, bytes32 sendRoot, uint64 nodeIndex, bytes rlpEncodedBlock)',
        'tuple(bytes, bytes[])',
      ],
      [
        [
          ethers.ZeroHash,
          commit.sendRoot,
          commit.index,
          commit.rlpEncodedBlock,
        ],
        accountProof,
        storageProofs,
      ]
    );
  }
  override async fetchLatestCommitIndex(blockDelay: number): Promise<number> {
    const blockTag = await delayedBlockTag(this.provider1, blockDelay);
    return Number(await this.L2Rollup.latestConfirmed({ blockTag }));
  }
  override async fetchCommit(index: number) {
    const [event] = await this.L2Rollup.queryFilter(
      this.L2Rollup.filters.NodeCreated(index)
    );
    if (!(event instanceof ethers.EventLog)) {
      throw new Error(`unknown node index: ${index}`);
    }
    // ethers bug: named abi parsing doesn't propagate through event tuples
    const [blockHash, sendRoot] = event.args[4][1][0][0]; //event.args.afterState.globalState.bytes32Vals;
    const json = (await this.provider2.send('eth_getBlockByHash', [
      blockHash,
      false,
    ])) as RPCEthGetBlock;
    const rlpEncodedBlock = encodeRlpBlock(json);
    return new NitroCommit(
      index,
      new EVMProver(this.provider2, json.number, this.makeCommitCache()),
      blockHash,
      sendRoot,
      rlpEncodedBlock
    );
  }
}
