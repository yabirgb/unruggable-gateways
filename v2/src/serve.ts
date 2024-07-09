import { OPGateway } from './gateway/OPGateway.js';
import { OPFaultGateway } from './gateway/OPFaultGateway.js';
import { NitroGateway } from './gateway/NitroGateway.js';
import { ScrollGateway } from './gateway/ScrollGateway.js';
import {
  CHAIN_ARB1,
  CHAIN_BASE,
  CHAIN_OP,
  CHAIN_SCROLL,
  createProviderPair,
} from './providers.js';
import { serve } from '@resolverworks/ezccip';
import type { Provider } from './types.js';

const [, , name, port] = process.argv;
let gateway;
switch (name) {
  case 'op': {
    gateway = OPFaultGateway.mainnet(createProviderPair(CHAIN_OP));
    break;
  }
  case 'arb': {
    gateway = NitroGateway.arb1Mainnet(createProviderPair(CHAIN_ARB1));
    break;
  }
  case 'base': {
    gateway = OPGateway.baseMainnet(createProviderPair(CHAIN_BASE));
    break;
  }
  case 'scroll': {
    gateway = ScrollGateway.mainnet(createProviderPair(CHAIN_SCROLL));
    break;
  }
  default:
    throw new Error(`unknown gateway: ${name}`);
}

function networkName(p: Provider) {
  return `${p._network.name} / ${p._network.chainId}`;
}

console.log({
  impl: gateway.constructor.name,
  chain1: networkName(gateway.provider1),
  chain2: networkName(gateway.provider2),
});

await serve(gateway, { protocol: 'raw', port: parseInt(port) || 8000 });
