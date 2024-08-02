import { ethers } from 'ethers';
import { CHAIN_MAINNET, createProvider } from '../providers.js';

const provider = createProvider(CHAIN_MAINNET);

const contract = new ethers.Contract(
  '0x6cbf8cd866a0fae64b9c2b007d3d47c4e1b809ff',
  [
    'function findDelayedGameIndex(address portal, uint256 delaySec) external view returns (uint256)',
  ],
  provider
);

console.log(
  await contract.findDelayedGameIndex.estimateGas(
    '0xbEb5Fc579115071764c7423A4f12eDde41f106Ed',
    0
  )
);
// 860838n