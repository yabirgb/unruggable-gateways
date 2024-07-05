import { ethers } from 'ethers';
import type { HexString, Proof } from '../types.js';
import {
  AbstractCommit,
  AbstractGateway,
  ABI_CODER,
  type GatewayConstructor,
  encodeProofV1,
} from './AbstractGateway.js';

//https://polygonscan.com/address/0xbf6d2C96547Bb015961cb38D30596a781C7039e1#code
const POLYGON_ROLLUP_ADDRESS = '0xbf6d2C96547Bb015961cb38D30596a781C7039e1';

type PolygonGatewayConstructor = {
  PolygonRollup: HexString;
};

class PolygonCommit extends AbstractCommit {
  constructor(block: HexString) {
    //index, block number (hex), blockHash
    //This is a contrived POC, index and blockHash are not used
    super(0, block, '0x0');
  }
}

export class PolygonGateway extends AbstractGateway<AbstractCommit> {
  static polygonMainnet(a: GatewayConstructor) {
    return new this({
      PolygonRollup: POLYGON_ROLLUP_ADDRESS,
      ...a,
    });
  }
  readonly PolygonRollup: ethers.Contract;
  constructor(args: GatewayConstructor & PolygonGatewayConstructor) {
    super(args);
    this.PolygonRollup = new ethers.Contract(
      args.PolygonRollup,
      [
        'function getStateRoot(uint256 blockNumber) view returns (bytes32)',
        'function getLatestBlockNumber() view returns (uint256)',
      ],
      this.provider1
    );
  }
  override async fetchLatestCommitIndex(): Promise<number> {
    console.log("huh", await this.PolygonRollup.getLatestBlockNumber());
    return Number(await this.PolygonRollup.getLatestBlockNumber());
  }
  override async fetchCommit(index: number): Promise<PolygonCommit> {
    console.log("pppp", this.PolygonRollup);
    const output = (await this.PolygonRollup.getLatestBlockNumber());// as {
    //  block: bigint;
    //};
    console.log("ppppp2", output);
    return new PolygonCommit('0x' + output.toString(16));
  }

  override encodeWitness(
    commit: PolygonCommit,
    proofs: Proof[],
    order: Uint8Array
  ) {

    console.log("encode", proofs);
    return ABI_CODER.encode(
      ['uint256', 'bytes[][]', 'bytes'],
      [commit.block, proofs, order]
    );
  }

  /**
   * Non-functional
   * Polygon was never supported by V1
   * This is a contrived example
   * This is here for interface conformity
   */
  override encodeWitnessV1(
    commit: PolygonCommit,
    accountProof: Proof,
    storageProofs: Proof[]
  ) {
    /*
     * No implementation body
     */
  }
}
