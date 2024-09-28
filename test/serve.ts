import { createProviderPair, createProvider } from './providers.js';
import { chainName } from '../src/chains.js';
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
import type { Serve } from 'bun';

// NOTE: you can use CCIPRewriter to test an existing setup against a local gateway!
// https://adraffy.github.io/ens-normalize.js/test/resolver.html#raffy.linea.eth.nb2hi4dthixs62dpnvss4ylooruxg5dvobuwiltdn5ws65lsm4xq.ccipr.eth
// 1. bun serve lineaV1
// 2. https://adraffy.github.io/CCIPRewriter.sol/test/
// 3. enter name: "raffy.linea.eth"
// 4. enter endpoint: "http://localhost:8000"
// 5. click (Resolve)

let prefetch = false;
const args = process.argv.slice(2).filter((x) => {
  if (x === '--prefetch') {
    prefetch = true;
    return false;
  }
  return true;
});
const gateway = await createGateway(args[0]);
const port = parseInt(args[1]) || 8000;

if (prefetch) {
  setInterval(() => gateway.getLatestCommit(), gateway.latestCache.cacheMs);
}

const config = {
  gateway: gateway.constructor.name,
  rollup: gateway.rollup.constructor.name,
  chain1: chainName(gateway.rollup.provider1._network.chainId),
  chain2: chainName(gateway.rollup.provider2._network.chainId),
  since: new Date(),
};

console.log(new Date(), `${config.rollup} on ${port}`);
const headers = { 'access-control-allow-origin': '*' }; // TODO: cli-option to disable cors?
export default {
  port,
  async fetch(req) {
    switch (req.method) {
      case 'OPTIONS': {
        return new Response(null, {
          headers: { ...headers, 'access-control-allow-headers': '*' },
        });
      }
      case 'GET': {
        const commit = await gateway.getLatestCommit();
        return Response.json({
          ...config,
          // TODO: add more stats
          commit: commit.index.toString(),
          cached: commit.prover.proofLRU.size,
        });
      }
      case 'POST': {
        const t0 = performance.now();
        try {
          const { sender, data: calldata } = await req.json();
          const { data, history } = await gateway.handleRead(sender, calldata, {
            protocol: 'raw',
          });
          console.log(
            new Date(),
            history.toString(),
            Math.round(performance.now() - t0)
          );
          return Response.json({ data }, { headers });
        } catch (err) {
          const error = String(err);
          console.log(new Date(), error);
          return Response.json({ error }, { headers, status: 500 });
        }
      }
      default: {
        return new Response('unsupported', { status: 405 });
      }
    }
  },
} satisfies Serve;
// await serve(gateway, { protocol: 'raw', port: parseInt(port) || 8000 });

async function createGateway(name: string) {
  switch (name) {
    case 'op': {
      const config = OPFaultRollup.mainnetConfig;
      return new Gateway(new OPFaultRollup(createProviderPair(config), config));
    }
    case 'base-testnet': {
      const config = OPFaultRollup.baseTestnetConfig;
      return new Gateway(new OPFaultRollup(createProviderPair(config), config));
    }
    case 'reverse-op': {
      const config = OPReverseRollup.mainnetConfig;
      return new Gateway(
        new OPReverseRollup(createProviderPair(config), config)
      );
    }
    case 'arb1': {
      const config = NitroRollup.arb1MainnetConfig;
      return new Gateway(new NitroRollup(createProviderPair(config), config));
    }
    case 'linea': {
      const config = LineaRollup.mainnetConfig;
      return new Gateway(new LineaRollup(createProviderPair(config), config));
    }
    case 'lineaV1': {
      const config = LineaRollup.mainnetConfig;
      return new LineaGatewayV1(
        new LineaRollup(createProviderPair(config), config)
      );
    }
    case 'polygon': {
      const config = PolygonPoSRollup.mainnetConfig;
      return new Gateway(
        new PolygonPoSRollup(createProviderPair(config), config)
      );
    }
    case 'scroll': {
      const config = ScrollRollup.mainnetConfig;
      return new Gateway(
        await ScrollRollup.create(createProviderPair(config), config)
      );
    }
    case 'taiko': {
      const config = TaikoRollup.mainnetConfig;
      return new Gateway(
        await TaikoRollup.create(createProviderPair(config), config)
      );
    }
    case 'zksync': {
      const config = ZKSyncRollup.mainnetConfig;
      return new Gateway(new ZKSyncRollup(createProviderPair(config), config));
    }
    case 'base': {
      const config = OPRollup.baseMainnetConfig;
      return new Gateway(new OPRollup(createProviderPair(config), config));
    }
    case 'blast': {
      const config = OPRollup.blastMainnnetConfig;
      return new Gateway(new OPRollup(createProviderPair(config), config));
    }
    case 'fraxtal': {
      const config = OPRollup.fraxtalMainnetConfig;
      return new Gateway(new OPRollup(createProviderPair(config), config));
    }
    case 'mode': {
      const config = OPRollup.modeMainnetConfig;
      return new Gateway(new OPRollup(createProviderPair(config), config));
    }
    case 'mantle': {
      const config = OPRollup.mantleMainnetConfig;
      return new Gateway(new OPRollup(createProviderPair(config), config));
    }
    case 'cyber': {
      const config = OPRollup.cyberMainnetConfig;
      return new Gateway(new OPRollup(createProviderPair(config), config));
    }
    case 'redstone': {
      const config = OPRollup.redstoneMainnetConfig;
      return new Gateway(new OPRollup(createProviderPair(config), config));
    }
    case 'zora': {
      const config = OPRollup.zoraMainnetConfig;
      return new Gateway(new OPRollup(createProviderPair(config), config));
    }
    case 'self-eth': {
      return new Gateway(new EthSelfRollup(createProvider(CHAINS.MAINNET)));
    }
    case 'self-sepolia': {
      return new Gateway(new EthSelfRollup(createProvider(CHAINS.SEPOLIA)));
    }
    default: {
      throw new Error(`unknown gateway: ${name}`);
    }
  }
}
