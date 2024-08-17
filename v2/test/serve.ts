import type { Provider } from '../src/types.js';
import type { Rollup } from '../src/rollup.js';
import { OPRollup } from '../src/op/OPRollup.js';
import { OPFaultRollup } from '../src/op/OPFaultRollup.js';
import { NitroRollup } from '../src/nitro/NitroRollup.js';
import { ScrollRollup } from '../src/scroll/ScrollRollup.js';
import { TaikoRollup } from '../src/taiko/TaikoRollup.js';
import { ZKSyncRollup } from '../src/zksync/ZKSyncRollup.js';
import { createProviderPair } from './providers.js';
import { serve } from '@resolverworks/ezccip';
import { Gateway } from '../src/gateway.js';

const [, , name, port] = process.argv;
let rollup: Rollup;
switch (name) {
  case 'op': {
    const config = OPFaultRollup.mainnetConfig;
    rollup = await OPFaultRollup.create(createProviderPair(config), config);
    break;
  }
  case 'arb1': {
    const config = NitroRollup.arb1MainnetConfig;
    rollup = new NitroRollup(createProviderPair(config), config);
    break;
  }
  case 'base': {
    const config = OPRollup.baseMainnetConfig;
    rollup = new OPRollup(createProviderPair(config), config);
    break;
  }
  // case 'base-testnet': {
  //   const config = OPFaultRollup.baseTestnetConfig;
  //   rollup = await OPFaultRollup.create(createProviderPair(config), config);
  //   break;
  // }
  case 'scroll': {
    const config = ScrollRollup.mainnetConfig;
    rollup = await ScrollRollup.create(createProviderPair(config), config);
    break;
  }
  case 'taiko': {
    const config = TaikoRollup.mainnetConfig;
    rollup = await TaikoRollup.create(createProviderPair(config), config);
    break;
  }
  case 'zksync': {
    const config = ZKSyncRollup.mainnetConfig;
    rollup = new ZKSyncRollup(createProviderPair(config), config);
    break;
  }
  default:
    throw new Error(`unknown gateway: ${name}`);
}

function networkName(p: Provider) {
  return `${p._network.name} / ${p._network.chainId}`;
}

console.log({
  impl: rollup.constructor.name,
  chain1: networkName(rollup.provider1),
  chain2: networkName(rollup.provider2),
});

const gateway = new Gateway(rollup);
await serve(gateway, { protocol: 'raw', port: parseInt(port) || 8000 });
