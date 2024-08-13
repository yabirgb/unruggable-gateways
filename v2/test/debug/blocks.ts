import { ethers } from 'ethers';
import { CHAIN_MAINNET } from '../../src/chains.js';
import { createProvider } from '../providers.js';
import { delayedBlockTag } from '../../src/utils.js';

const provider = createProvider(CHAIN_MAINNET);

const multicall3 = new ethers.Contract(
  '0xcA11bde05977b3631167028862bE2a173976CA11',
  ['function getBlockNumber() view returns (uint256)'],
  provider
);

console.log(await delayedBlockTag(provider, 1));

console.log(
  Object.fromEntries(
    await Promise.all(
      ['finalized', 'safe', 'latest'].map(async (blockTag) => [
        blockTag,
        await multicall3.getBlockNumber({ blockTag }),
      ])
    )
  )
);
