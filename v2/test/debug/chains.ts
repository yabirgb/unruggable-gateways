import * as Chains from '../../src/chains';
import { ethers } from 'ethers';
import { providerURL } from '../providers';

for (const [key, chain] of Object.entries(Chains)) {
  console.log({
    key,
    chain,
    name: ethers.Network.from(chain).name,
    url: providerURL(chain),
  });
}
