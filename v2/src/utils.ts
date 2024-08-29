import {
  type JsonRpcPayload,
  makeError,
  AbiCoder,
  id as keccakStr,
} from 'ethers';
import { Provider, BigNumberish, HexString } from './types';

export const ABI_CODER = AbiCoder.defaultAbiCoder();

// https://adraffy.github.io/keccak.js/test/demo.html#algo=keccak-256&s=&escape=1&encoding=utf8
// "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
export const NULL_CODE_HASH = keccakStr('');

export function toString16(x: BigNumberish): HexString {
  return '0x' + BigInt(x).toString(16);
}

export async function sendImmediate(
  provider: Provider,
  method: string,
  params: any[]
): Promise<any> {
  if (provider._getOption('batchMaxCount') == 1) {
    return provider.send(method, params);
  }
  // https://github.com/ethers-io/ethers.js/issues/4819
  const id = ((Math.random() * 0x7fffffff) | 0x80000000) >>> 0;
  const payload: JsonRpcPayload = {
    method,
    params,
    id,
    jsonrpc: '2.0',
  };
  // attempt to emulate what ethers does
  // https://github.com/ethers-io/ethers.js/blob/main/lib.esm/providers/provider-jsonrpc.js
  provider.emit('debug', { action: 'sendRpcPayload', payload });
  let resp;
  try {
    const result = await provider._send(payload);
    provider.emit('debug', { action: 'receiveRpcResult', result });
    resp = result.find((x) => x.id === id);
    if (!resp) {
      const error = makeError('missing response for request', 'BAD_DATA', {
        value: result,
        info: { payload },
      });
      provider.emit('error', error);
      throw error;
    }
  } catch (error) {
    provider.emit('debug', { action: 'receiveRpcError', error });
    throw error;
  }
  if ('result' in resp) {
    return resp.result;
  } else {
    throw provider.getRpcError(payload, resp);
  }
}
