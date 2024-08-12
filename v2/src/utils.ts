import type { Provider } from 'ethers';
import { ethers } from 'ethers';

export const ABI_CODER = ethers.AbiCoder.defaultAbiCoder();

export async function delayedBlockTag(
  provider: Provider,
  blockDelay: number
): Promise<ethers.BlockTag> {
  if (!blockDelay) return 'latest';
  return (await provider.getBlockNumber()) - blockDelay;
}
