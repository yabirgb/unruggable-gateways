import type { EncodedProof, HexString } from '../types.js';
import {
  AbstractCommit,
  AbstractGatewayNoV1,
  type AbstractGatewayConstructor,
} from '../AbstractGateway.js';
import { encodeRlpBlock } from '../rlp.js';
import { EVMProver } from '../evm/prover.js';
import { ABI_CODER } from '../utils.js';
import type { RPCEthGetBlock } from '../evm/types.js';

class UnverifiedTaikoCommit extends AbstractCommit<EVMProver> {
  constructor(
    index: number,
    prover: EVMProver,
    readonly rlpEncodedBlock: HexString
  ) {
    super(index, prover);
  }
}

// warning: this is only protected by config.livenessBond
// on mainnet, this is 125 $TAIKO and minTeir is SGX with 24-hr (Teir.cooldownWindow)
// however, this is useful for testing

export class UnverifiedTaikoGateway extends AbstractGatewayNoV1<
  EVMProver,
  UnverifiedTaikoCommit
> {
  static defaultConfig: Partial<AbstractGatewayConstructor> = {
    writeCommitMs: 16000, // every block 12-20 sec
    commitStep: 5 * 15, // every 15-25 min
  };
  override encodeWitness(
    commit: UnverifiedTaikoCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ) {
    return ABI_CODER.encode(
      ['bytes', 'bytes[][]', 'bytes'],
      [commit.rlpEncodedBlock, proofs, order]
    );
  }
  override async fetchLatestCommitIndex(blockDelay: number) {
    return (
      Number(await this.provider2.getBlockNumber()) -
      this.effectiveCommitDelay(blockDelay)
    );
  }
  override async fetchCommit(index: number): Promise<UnverifiedTaikoCommit> {
    const block = '0x' + index.toString(16);
    const json = (await this.provider2.send('eth_getBlockByNumber', [
      block,
      false,
    ])) as RPCEthGetBlock;
    const rlpEncodedBlock = encodeRlpBlock(json);
    return new UnverifiedTaikoCommit(
      index,
      new EVMProver(this.provider2, block, this.makeCommitCache()),
      rlpEncodedBlock
    );
  }
}
