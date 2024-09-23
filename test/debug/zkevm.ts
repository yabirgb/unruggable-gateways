import { CHAINS } from '../../src/chains.js';
import { toPaddedHex } from '../../src/utils.js';
import { createProvider } from '../providers.js';

const p = createProvider(CHAINS.POLYGON_ZKEVM_CARDONA);

console.log(
  await p.send('eth_getProof', [
    '0x32d33D5137a7cFFb54c5Bf8371172bcEc5f310ff',
    [toPaddedHex(0)],
    'latest',
  ])
);
