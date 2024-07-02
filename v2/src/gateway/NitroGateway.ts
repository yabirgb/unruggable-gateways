import { ethers } from 'ethers';
import type { HexString, Proof } from '../types.js';
import {
  AbstractCommit,
  AbstractGateway,
  ABI_CODER,
  type GatewayConstructor,
  encodeProofV1,
} from './AbstractGateway.js';

type NitroGatewayConstructor = {
  L2Rollup: HexString;
};

class NitroCommit extends AbstractCommit {
  constructor(
    index: number,
    block: HexString,
    blockHash: HexString,
    readonly sendRoot: HexString,
    readonly rlpEncodedBlock: HexString
  ) {
    super(index, block, blockHash);
  }
}

export class NitroGateway extends AbstractGateway<NitroCommit> {
  static arb1Mainnet(a: GatewayConstructor) {
    // https://docs.arbitrum.io/build-decentralized-apps/reference/useful-addresses
    return new this({
      L2Rollup: '0x5eF0D09d1E6204141B4d37530808eD19f60FBa35',
      ...a,
    });
  }
  readonly L2Rollup: ethers.Contract;
  constructor(args: GatewayConstructor & NitroGatewayConstructor) {
    super(args);
    this.L2Rollup = new ethers.Contract(
      args.L2Rollup,
      [
        'function latestNodeCreated() external view returns (uint64)',
        `event NodeCreated(
				uint64 indexed nodeNum,
				bytes32 indexed parentNodeHash,
				bytes32 indexed nodeHash,
				bytes32 executionHash,
				tuple(
					tuple(tuple(bytes32[2] bytes32Vals, uint64[2] u64Vals) globalState, uint8 machineStatus) beforeState, 
					tuple(tuple(bytes32[2] bytes32Vals, uint64[2] u64Vals) globalState, uint8 machineStatus) afterState, 
					uint64 numBlocks
				) assertion, 
				bytes32 afterInboxBatchAcc, 
				bytes32 wasmModuleRoot, 
				uint256 inboxMaxCount
			)`,
      ],
      this.provider1
    );
  }
  override encodeWitness(
    commit: NitroCommit,
    proofs: Proof[],
    order: Uint8Array
  ) {
    return ABI_CODER.encode(
      ['bytes32', 'bytes', 'bytes[][]', 'bytes'],
      [commit.sendRoot, commit.rlpEncodedBlock, proofs, order]
    );
  }
  override encodeWitnessV1(
    commit: NitroCommit,
    accountProof: Proof,
    storageProofs: Proof[]
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
        encodeProofV1(accountProof),
        storageProofs.map(encodeProofV1),
      ]
    );
  }
  override async fetchLatestCommitIndex(): Promise<number> {
    return Number(await this.L2Rollup.latestNodeCreated());
  }
  override async fetchCommit(index: number) {
    const [event] = await this.L2Rollup.queryFilter(
      this.L2Rollup.filters.NodeCreated(index)
    );
    if (!(event instanceof ethers.EventLog))
      throw new Error(`unknown node index: ${index}`);
    const [blockHash, sendRoot] = event.args[4][1][0][0]; //event.args.toObject(true).afterState.globalState.bytes32Vals;
    const json = await this.provider2.send('eth_getBlockByHash', [
      blockHash,
      false,
    ]);
    const rlpEncodedBlock = ethers.encodeRlp([
      json.parentHash,
      json.sha3Uncles,
      json.miner,
      json.stateRoot,
      json.transactionsRoot,
      json.receiptsRoot,
      json.logsBloom,
      ethers.toBeHex(json.difficulty),
      ethers.toBeHex(json.number),
      ethers.toBeHex(json.gasLimit),
      ethers.toBeHex(json.gasUsed),
      ethers.toBeHex(json.timestamp),
      json.extraData,
      json.mixHash,
      json.nonce,
      ethers.toBeHex(json.baseFeePerGas),
    ]);
    return new NitroCommit(
      index,
      json.number,
      blockHash,
      sendRoot,
      rlpEncodedBlock
    );
  }
}
