import type { Rollup } from '../src/rollup.js';
import { createProviderPair, chainName, createProvider } from './providers.js';
import { EZCCIP, serve } from '@resolverworks/ezccip';
import { Gateway } from '../src/gateway.js';
import { OPRollup } from '../src/op/OPRollup.js';
import { OPFaultRollup } from '../src/op/OPFaultRollup.js';
import { OPReverseRollup } from '../src/op/OPReverseRollup.js';
import { NitroRollup } from '../src/nitro/NitroRollup.js';
import { ScrollRollup } from '../src/scroll/ScrollRollup.js';
import { TaikoRollup } from '../src/taiko/TaikoRollup.js';
import { LineaRollup } from '../src/linea/LineaRollup.js';
import { LineaGatewayV1 } from '../src/linea/LineaGatewayV1.js';
import { ZKSyncRollup } from '../src/zksync/ZKSyncRollup.js';
import { PolygonPoSRollup } from '../src/polygon/PolygonPoSRollup.js';
import { EthSelfRollup } from '../src/eth/EthSelfRollup.js';
import { CHAINS } from '../src/chains.js';

// TODO: add timer based pre-fetch for commit via cli-option
// TODO: add names for all of the missing rollups (and testnets)
const [, , name, port] = process.argv;
let gateway: EZCCIP & { readonly rollup: Rollup };
switch (name) {
  case 'op': {
    const config = OPFaultRollup.mainnetConfig;
    gateway = new Gateway(
      new OPFaultRollup(createProviderPair(config), config)
    );
    break;
  }
  case 'reverse-op': {
    const config = OPReverseRollup.mainnetConfig;
    gateway = new Gateway(
      new OPReverseRollup(createProviderPair(config), config)
    );
    break;
  }
  case 'arb1': {
    const config = NitroRollup.arb1MainnetConfig;
    gateway = new Gateway(new NitroRollup(createProviderPair(config), config));
    break;
  }
  case 'base': {
    const config = OPRollup.baseMainnetConfig;
    gateway = new Gateway(new OPRollup(createProviderPair(config), config));
    break;
  }
  case 'base-testnet': {
    const config = OPFaultRollup.baseTestnetConfig;
    gateway = new Gateway(
      new OPFaultRollup(createProviderPair(config), config)
    );
    break;
  }
  case 'linea': {
    const config = LineaRollup.mainnetConfig;
    gateway = new Gateway(new LineaRollup(createProviderPair(config), config));
    break;
  }
  case 'lineaV1': {
    const config = LineaRollup.mainnetConfig;
    gateway = new LineaGatewayV1(
      new LineaRollup(createProviderPair(config), config)
    );
    break;
  }
  case 'polygon': {
    const config = PolygonPoSRollup.mainnetConfig;
    gateway = new Gateway(
      new PolygonPoSRollup(createProviderPair(config), config)
    );
    break;
  }
  case 'scroll': {
    const config = ScrollRollup.mainnetConfig;
    gateway = new Gateway(
      await ScrollRollup.create(createProviderPair(config), config)
    );
    break;
  }
  case 'taiko': {
    const config = TaikoRollup.mainnetConfig;
    gateway = new Gateway(
      await TaikoRollup.create(createProviderPair(config), config)
    );
    break;
  }
  case 'zksync': {
    const config = ZKSyncRollup.mainnetConfig;
    gateway = new Gateway(new ZKSyncRollup(createProviderPair(config), config));
    break;
  }
  case 'blast': {
    const config = OPRollup.blastMainnnetConfig;
    gateway = new Gateway(new OPRollup(createProviderPair(config), config));
    break;
  }
  case 'fraxtal': {
    const config = OPRollup.fraxtalMainnetConfig;
    gateway = new Gateway(new OPRollup(createProviderPair(config), config));
    break;
  }
  case 'zora': {
    const config = OPRollup.zoraMainnetConfig;
    gateway = new Gateway(new OPRollup(createProviderPair(config), config));
    break;
  }
  case 'self-eth': {
    gateway = new Gateway(new EthSelfRollup(createProvider(CHAINS.MAINNET)));
    break;
  }
  default: {
    throw new Error(`unknown gateway: ${name}`);
  }
}

console.log({
  rollup: gateway.rollup.constructor.name,
  gateway: gateway.constructor.name,
  chain1: chainName(gateway.rollup.provider1._network.chainId),
  chain2: chainName(gateway.rollup.provider2._network.chainId),
});
await serve(gateway, { protocol: 'raw', port: parseInt(port) || 8000 });

// TODO: https://github.com/ardatan/whatwg-node/blob/master/packages/server/src/createServerAdapter.ts
// 20240920: i dont understand this design, it's just a file that default-exports
// a function that takes a Request and returns a Response?

// NOTE: you can use CCIPRewriter to test an existing setup against a local gateway!
// 1. bun serve lineaV1
// 2. https://adraffy.github.io/CCIPRewriter.sol/test/
// 3. enter name: "raffy.eth.linea"
// 4. enter endpoint: "http://localhost:8000"
// 5. click (Resolve)
