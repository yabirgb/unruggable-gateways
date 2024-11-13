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

export const LATEST_BLOCK_TAG = 'latest';

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

function isBlockTag(x: BigNumberish): x is string {
  return typeof x === 'string' && !x.startsWith('0x');
}

export async function fetchBlock(
  provider: Provider,
  relBlockTag: BigNumberish = LATEST_BLOCK_TAG
): Promise<RPCEthGetBlock> {
  if (!isBlockTag(relBlockTag)) {
    let i = BigInt(relBlockTag);
    if (i < 0) i = await fetchBlockNumber(provider, i);
    relBlockTag = toUnpaddedHex(i);
  }
  const json = await provider.send('eth_getBlockByNumber', [
    relBlockTag,
    false,
  ]);
  if (!json) throw new Error(`no block: ${relBlockTag}`);
  return json;
}

// avoid an rpc if possible
// use negative (-100) for offset from "latest" (#-100)
export async function fetchBlockNumber(
  provider: Provider,
  relBlockTag: BigNumberish = LATEST_BLOCK_TAG
): Promise<bigint> {
  if (relBlockTag === LATEST_BLOCK_TAG) {
    return BigInt(await provider.send('eth_blockNumber', []));
  } else if (isBlockTag(relBlockTag)) {
    const info = await fetchBlock(provider, relBlockTag);
    return BigInt(info.number);
  } else {
    const i = BigInt(relBlockTag);
    if (i < 0) {
      const latest = await fetchBlockNumber(provider);
      return latest + i;
    } else {
      return i;
    }
  }
}

// avoid an rpc if possible
// convert negative (-100) => absolute (#-100)
export async function fetchBlockTag(
  provider: Provider,
  relBlockTag: BigNumberish = LATEST_BLOCK_TAG
): Promise<string | bigint> {
  if (isBlockTag(relBlockTag)) return relBlockTag;
  const i = BigInt(relBlockTag);
  if (!i) return LATEST_BLOCK_TAG;
  return fetchBlockNumber(provider, i);
}

export function isRPCError(err: any, code: number) {
  return (
    err instanceof Error &&
    'error' in err &&
    err.error instanceof Object &&
    'code' in err.error &&
    err.error.code === code
  );
}
