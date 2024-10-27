import { Chain } from './types.js';
import { withResolvers } from './utils.js';
import {
  JsonRpcPayload,
  JsonRpcProvider,
  JsonRpcResult,
} from 'ethers/providers';
import { FetchRequest } from 'ethers/utils';

function shouldNeverBatch(payload: JsonRpcPayload) {
  return payload.method === 'linea_getProof';
}

export class GatewayProvider extends JsonRpcProvider {
  constructor(
    fr: FetchRequest,
    readonly chain: Chain
  ) {
    super(fr, chain, { staticNetwork: true });
  }
  override async _send(
    payload: JsonRpcPayload | JsonRpcPayload[]
  ): Promise<JsonRpcResult[]> {
    if (Array.isArray(payload)) {
      const ps: Promise<any>[] = [];
      const batch: JsonRpcPayload[] = [];
      const { promise, resolve, reject } = withResolvers<JsonRpcResult[]>();
      const ret = payload.map((x) => {
        if (shouldNeverBatch(x)) {
          const p = this._sendWithRetry(x).then((x) => x[0]);
          ps.push(p);
          return p;
        } else {
          const i = batch.length;
          batch.push(x);
          return promise.then((v) => v[i]);
        }
      });
      if (batch.length) {
        ps.push(this._sendWithRetry(batch).then(resolve, reject));
        return Promise.all(ps).then(() => Promise.all(ret));
      } else {
        return Promise.all(ret);
      }
    }
    return this._sendWithRetry(payload);
  }
  async _sendWithRetry(
    payload: JsonRpcPayload | JsonRpcPayload[]
  ): Promise<JsonRpcResult[]> {
    let backoff = 250;
    for (let attempt = 0; ; attempt++) {
      try {
        // ethers bug: this type is wrong
        const results: any[] = await super._send(payload);
        if (!results.some((x) => x.error?.code === 429)) {
          // what the fuck is this
          // https://docs.alchemy.com/reference/throughput
          return results;
        }
      } catch (err) {
        if (
          err instanceof Error &&
          !Array.isArray(payload) &&
          payload.method == 'eth_getProof' &&
          'code' in err &&
          (err.code === 'UNKNOWN_ERROR' || err.code === 'TIMEOUT')
        ) {
          // eth_getProof failed
          // this is to deal with erigon polygon rpcs
        } else {
          throw err;
        }
      }
      //console.log('retry');
      this.emit('debug', { action: 'retry', attempt });
      await new Promise((ful) => setTimeout(ful, backoff));
      backoff *= 2;
    }
  }
}
