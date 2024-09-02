import { CHAINS } from '../../src/chains.js';
import { createProvider } from '../providers.js';
import { ethers } from 'ethers';

const p = createProvider(CHAINS.POLYGON_ZKEVM_CARDONA);

console.log(
  await p.send('eth_getProof', [
    '0x32d33D5137a7cFFb54c5Bf8371172bcEc5f310ff',
    [ethers.toBeHex(0n, 32)],
    'latest',
  ])
);
