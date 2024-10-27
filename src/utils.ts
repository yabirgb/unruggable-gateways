import { AbiCoder } from 'ethers/abi';
import { id as keccakStr } from 'ethers/hash';
import type { Provider, BigNumberish, HexString } from './types.js';
import type { RPCEthGetBlock } from './eth/types.js';

export const ABI_CODER = AbiCoder.defaultAbiCoder();

// https://adraffy.github.io/keccak.js/test/demo.html#algo=keccak-256&s=&escape=1&encoding=utf8
// "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
export const NULL_CODE_HASH = keccakStr('');

export const EVM_BLOCKHASH_DEPTH = 256;

export const MAINNET_BLOCK_SEC = 12;

// hex-prefixed w/o zero-padding
export function toUnpaddedHex(x: BigNumberish | boolean): HexString {
  return '0x' + BigInt(x).toString(16);
}
// hex-prefixed left-pad w/truncation
export function toPaddedHex(x: BigNumberish | boolean, width = 32) {
  const i = x === '0x' ? 0n : BigInt.asUintN(width << 3, BigInt(x));
  return '0x' + i.toString(16).padStart(width << 1, '0');
}

// manual polyfill: ES2024
export function withResolvers<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((ful, rej) => {
    resolve = ful;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export async function fetchBlock(
  provider: Provider,
  block: BigNumberish = 'latest'
) {
  const json: RPCEthGetBlock | null = await provider.send(
    'eth_getBlockByNumber',
    [typeof block === 'string' ? block : toUnpaddedHex(block), false]
  );
  if (!json) throw new Error(`no block: ${block}`);
  return json;
}

export async function fetchBlockNumber(
  provider: Provider,
  relBlockTag: BigNumberish = 0
): Promise<bigint> {
  if (relBlockTag == 0) {
    return BigInt(await provider.send('eth_blockNumber', []));
  } else if (typeof relBlockTag === 'string') {
    const info = await fetchBlock(provider, relBlockTag);
    return BigInt(info.number);
  } else {
    const i = await fetchBlockNumber(provider, 0);
    return i + BigInt(relBlockTag);
  }
}
