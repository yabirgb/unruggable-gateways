import { createProviderPair, createProvider } from '../test/providers.js';
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
import { USER_CONFIG } from './environment.js';

const port = USER_CONFIG.PORT || 8000;
const prefetch = USER_CONFIG.SHOULD_PREFETCH;
const gateway = await createGateway(USER_CONFIG);

if (prefetch) {
  setInterval(() => gateway.getLatestCommit(), gateway.latestCache.cacheMs);
}

const config = {
  rollup: gateway.rollup.constructor.name,
  gateway: gateway.constructor.name,
  chain1: chainName(gateway.rollup.provider1._network.chainId),
  chain2: chainName(gateway.rollup.provider2._network.chainId),
  since: new Date(),
};

console.log(new Date(), `Running ${config.rollup} on port ${port}`);

const commit = await gateway.getLatestCommit();

console.log({
  ...config,
  // TODO: add more stats
  commit: commit.index.toString(),
  cached: commit.prover.proofLRU.size,
});

// NOTE: you can use CCIPRewriter to test an existing setup against a local gateway!
// 1. bun serve lineaV1
// 2. https://adraffy.github.io/CCIPRewriter.sol/test/
// 3. enter name: "raffy.linea.eth"
// 4. enter endpoint: "http://localhost:8000"
// 5. click (Resolve)
export async function fetch(request) {
  const headers = { 'access-control-allow-origin': '*' }; // TODO: cli-option to disable cors?

  switch (request.method) {
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
        const { sender, data: calldata } = await request.json();
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
}

async function createGateway(userConfig: any) {
  switch (userConfig.CHAIN_NAME) {
    case 'op': {
      const config = OPFaultRollup.mainnetConfig;
      return new Gateway(
        new OPFaultRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'base-testnet': {
      const config = OPFaultRollup.baseTestnetConfig;
      return new Gateway(
        new OPFaultRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'reverse-op': {
      const config = OPReverseRollup.mainnetConfig;
      return new Gateway(
        new OPReverseRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'arb1': {
      const config = NitroRollup.arb1MainnetConfig;
      return new Gateway(
        new NitroRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'linea': {
      const config = LineaRollup.mainnetConfig;
      return new Gateway(
        new LineaRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'lineaV1': {
      const config = LineaRollup.mainnetConfig;
      return new LineaGatewayV1(
        new LineaRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'polygon': {
      const config = PolygonPoSRollup.mainnetConfig;
      return new Gateway(
        new PolygonPoSRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'scroll': {
      const config = ScrollRollup.mainnetConfig;
      return new Gateway(
        await ScrollRollup.create(
          createProviderPair(userConfig, config),
          config
        )
      );
    }
    case 'taiko': {
      const config = TaikoRollup.mainnetConfig;
      return new Gateway(
        await TaikoRollup.create(createProviderPair(userConfig, config), config)
      );
    }
    case 'zksync': {
      const config = ZKSyncRollup.mainnetConfig;
      return new Gateway(
        new ZKSyncRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'base': {
      const config = OPRollup.baseMainnetConfig;
      return new Gateway(
        new OPRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'blast': {
      const config = OPRollup.blastMainnnetConfig;
      return new Gateway(
        new OPRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'fraxtal': {
      const config = OPRollup.fraxtalMainnetConfig;
      return new Gateway(
        new OPRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'mode': {
      const config = OPRollup.modeMainnetConfig;
      return new Gateway(
        new OPRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'mantle': {
      const config = OPRollup.mantleMainnetConfig;
      return new Gateway(
        new OPRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'cyber': {
      const config = OPRollup.cyberMainnetConfig;
      return new Gateway(
        new OPRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'redstone': {
      const config = OPRollup.redstoneMainnetConfig;
      return new Gateway(
        new OPRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'zora': {
      const config = OPRollup.zoraMainnetConfig;
      return new Gateway(
        new OPRollup(createProviderPair(userConfig, config), config)
      );
    }
    case 'self-eth': {
      return new Gateway(
        new EthSelfRollup(createProvider(userConfig, CHAINS.MAINNET))
      );
    }
    case 'self-sepolia': {
      return new Gateway(
        new EthSelfRollup(createProvider(userConfig, CHAINS.SEPOLIA))
      );
    }
    default: {
      throw new Error(`unknown gateway: ${name}`);
    }
  }
}
