import { Foundry } from '@adraffy/blocksmith';
import { serve } from '@resolverworks/ezccip';
import { OPRollup } from '../../../src/op/OPRollup.js';
import { Gateway } from '../../../src/gateway.js';
import { ethers } from 'ethers';
import { providerURL, createProviderPair } from '../../providers.js';
import { solidityFollowSlot } from '../../../src/vm.js';

const config = OPRollup.baseMainnetConfig;
const rollup = new OPRollup(createProviderPair(config), config);
const gateway = new Gateway(rollup);
const ccip = await serve(gateway, { protocol: 'raw' });

const foundry = await Foundry.launch({
  fork: providerURL(config.chain1),
});
const verifier = await foundry.deploy({
  file: 'OPVerifier',
  args: [[ccip.endpoint], rollup.defaultWindow, rollup.L2OutputOracle],
});

const ENS = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const NODE = ethers.namehash('teamnick.eth');
const SLOT = solidityFollowSlot(0, NODE) + 1n;

const teamnick = await foundry.deploy({
  file: 'TeamNick',
  args: [ENS, verifier],
});

// replace real teamnick resolver with fake
await foundry.provider.send('anvil_setStorageAt', [
  ENS,
  ethers.toBeHex(SLOT, 32),
  ethers.toBeHex(teamnick.target, 32),
]);
const ens = new ethers.Contract(
  ENS,
  ['function resolver(bytes32 node) view returns (address)'],
  foundry.provider
);
console.log('Hijacked:', await ens.resolver(NODE));

async function resolve(name: string, keys = ['avatar'], coinType = 60) {
  const resolver = await foundry.provider.getResolver(name);
  if (!resolver) throw new Error('bug');
  const [address, texts] = await Promise.all([
    resolver.getAddress(coinType),
    Promise.all(keys.map((x) => resolver.getText(x))),
  ]);
  console.log({
    name,
    address,
    texts: Object.fromEntries(keys.map((x, i) => [x, texts[i]])),
  });
}

await resolve('raffy.teamnick.eth');
await resolve('slobo.teamnick.eth');
await resolve('teamnick.eth', ['url', 'description'], Number(config.chain2));
await resolve('_dne123.teamnick.eth');

ccip.http.close();
await foundry.shutdown();
