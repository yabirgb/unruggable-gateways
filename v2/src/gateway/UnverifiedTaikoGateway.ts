import type { HexString, Proof, RPCEthGetBlock } from '../types.js';
import {
  AbstractCommit,
  AbstractGatewayNoV1,
  ABI_CODER,
  type GatewayConstructor,
} from './AbstractGateway.js';
import { encodeRlpBlock } from '../rlp.js';

class UnverifiedTaikoCommit extends AbstractCommit {
  constructor(
    index: number,
    block: HexString,
    blockHash: HexString,
    readonly rlpEncodedBlock: HexString
  ) {
    super(index, block, blockHash);
  }
}

// warning: this is only protected by config.livenessBond
// on mainnet, this is 125 $TAIKO and minTeir is SGX with 24-hr (Teir.cooldownWindow)
// however, this is useful for testing

export class UnverifiedTaikoGateway extends AbstractGatewayNoV1<UnverifiedTaikoCommit> {
  static default(a: GatewayConstructor) {
    return new this({
      writeCommitMs: 16000, // every block 12-20 sec
      commitStep: 5 * 15, // every 15-25 min
      ...a,
    });
  }
  override encodeWitness(
    commit: UnverifiedTaikoCommit,
    proofs: Proof[],
    order: Uint8Array
  ) {
    return ABI_CODER.encode(
      ['bytes', 'bytes[][]', 'bytes'],
      [commit.rlpEncodedBlock, proofs, order]
    );
  }
  override async fetchLatestCommitIndex() {
    return Number(await this.provider2.getBlockNumber());
  }
  override async fetchCommit(index: number): Promise<UnverifiedTaikoCommit> {
    const block = '0x' + index.toString(16);
    const json = (await this.provider2.send('eth_getBlockByNumber', [
      block,
      false,
    ])) as RPCEthGetBlock;
    const rlpEncodedBlock = encodeRlpBlock(json);
    return new UnverifiedTaikoCommit(index, block, json.hash, rlpEncodedBlock);
  }
}
