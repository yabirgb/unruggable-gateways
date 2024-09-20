import { EZCCIP } from '@resolverworks/ezccip';
import { ABI_CODER, fetchBlock } from '../utils.js';
import { GATEWAY_ABI } from '../gateway.js';
import { Provider } from '../types.js';
import { EthProver } from './EthProver.js';
import { encodeRlpBlock } from '../rlp.js';

export class EthSelfGateway extends EZCCIP {
  constructor(provider: Provider) {
    super();
    this.register(GATEWAY_ABI, {
      proveRequest: async ([ctx, { ops, inputs }]) => {
        const blockInfo = await fetchBlock(provider, ctx);
        const rlpEncodedBlock = encodeRlpBlock(blockInfo);
        const prover = new EthProver(provider, blockInfo.number);
        const state = await prover.evalDecoded(ops, inputs);
        const proofSeq = await prover.prove(state.needs);
        return ABI_CODER.encode(
          ['bytes', 'bytes[]', 'bytes'],
          [rlpEncodedBlock, proofSeq.proofs, proofSeq.order]
        );
      },
    });
  }
}
