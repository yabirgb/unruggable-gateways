import type { RPCEthGetBlock } from './eth/types.js';
import type { Provider } from './types.js';
import { ethers } from 'ethers';

export const ABI_CODER = ethers.AbiCoder.defaultAbiCoder();

// https://adraffy.github.io/keccak.js/test/demo.html#algo=keccak-256&s=&escape=1&encoding=utf8
// "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
export const NULL_CODE_HASH = ethers.id('');

// export async function delayedBlockTag(
//   provider: Provider,
//   blockDelay: number,
//   blocksPerEpoch = 32,
//   blockOffset = 64, // finalized is 2 epochs
//   finalizedOffset = 10 // floor(blocksPerEpoch / 3)
// ) {
//   if (!blockDelay) return 'finalized'; // avoids extra rpc
//   let block = await provider.getBlockNumber();
//   block -= Math.max(blockDelay, blockOffset);
//   return block - ((block + finalizedOffset) & blocksPerEpoch);
// }

export async function delayedBlockTag(provider: Provider, blockDelay: number) {
  const blockTag = 'finalized';
  const min = 64; // 2 epoch
  if (blockDelay < min) return blockTag; // avoids extra rpc
  const block = (await provider.send('eth_getBlockByNumber', [
    blockTag,
    false,
  ])) as RPCEthGetBlock;
  return parseInt(block.number) + min - blockDelay;
}
