import type { Serve } from 'bun';
import type { Chain } from '../src/types.js';
import type { RollupDeployment, RollupCommitType } from '../src/rollup.js';
import { createProviderPair, createProvider } from '../test/providers.js';
import { CHAINS, chainName } from '../src/chains.js';
import { Gateway } from '../src/gateway.js';
import { type OPConfig, OPRollup } from '../src/op/OPRollup.js';
import { type OPFaultConfig, OPFaultRollup } from '../src/op/OPFaultRollup.js';
import { ReverseOPRollup } from '../src/op/ReverseOPRollup.js';
import { NitroRollup } from '../src/nitro/NitroRollup.js';
import { DoubleNitroRollup } from '../src/nitro/DoubleNitroRollup.js';
import { ScrollRollup } from '../src/scroll/ScrollRollup.js';
import { TaikoRollup } from '../src/taiko/TaikoRollup.js';
import { LineaRollup } from '../src/linea/LineaRollup.js';
import { LineaGatewayV1 } from '../src/linea/LineaGatewayV1.js';
import { UnfinalizedLineaRollup } from '../src/linea/UnfinalizedLineaRollup.js';
import { ZKSyncRollup } from '../src/zksync/ZKSyncRollup.js';
import { PolygonPoSRollup } from '../src/polygon/PolygonPoSRollup.js';
import { EthSelfRollup } from '../src/eth/EthSelfRollup.js';
import { Contract } from 'ethers/contract';
import { SigningKey } from 'ethers/crypto';
import { toUnpaddedHex } from '../src/utils.js';
import { TrustedRollup } from '../src/TrustedRollup.js';
import { EthProver } from '../src/eth/EthProver.js';
//import { LineaProver } from '../src/linea/LineaProver.js';
import { ZKSyncProver } from '../src/zksync/ZKSyncProver.js';

// NOTE: you can use CCIPRewriter to test an existing setup against a local gateway!
// [raffy] https://adraffy.github.io/ens-normalize.js/test/resolver.html#raffy.linea.eth.nb2hi4dthixs62dpnvss4ylooruxg5dvobuwiltdn5ws62duoryc6.ccipr.eth
// 1. bun serve lineaV1
// 2. https://adraffy.github.io/CCIPRewriter.sol/test/
// 3. enter name: "raffy.linea.eth"
// 4. enter endpoint: "http://localhost:8000"
// 5. click (Resolve)
// 6. https://adraffy.github.io/ens-normalize.js/test/resolver.html#raffy.linea.eth.nb2hi4b2f4xwy33dmfwgq33toq5dqmbqgaxq.ccipr.eth

let prefetch = !!process.env.PREFETCH;
let latestBlockTag = process.env.LATEST_BLOCK_TAG;
let signingKey =
  process.env.SIGNING_KEY ||
  '0xbd1e630bd00f12f0810083ea3bd2be936ead3b2fa84d1bd6690c77da043e9e02'; // 0xd00d from ezccip demo
const args = process.argv.slice(2).filter((x) => {
  if (x === '--prefetch') {
    prefetch = true;
    return;
  } else if (x === '--latest') {
    latestBlockTag = 'latest';
    return;
  } else if (/^0x[0-9a-f]{64}$/i.test(x)) {
    signingKey = x;
    return;
  }
  return true;
});
const gateway = await createGateway(args[0]);
const port = parseInt(args[1] || process.env.PORT || '') || 8000;

if (prefetch) {
  // periodically pull the latest commit so it's always fresh
  setInterval(() => gateway.getLatestCommit(), gateway.latestCache.cacheMs);
}

// how to configure gateway
if (gateway instanceof Gateway) {
  // gateway.commitDepth = 100;
  // gateway.allowHistorical = true;
  if (gateway.rollup.unfinalized) {
    gateway.commitDepth = 10;
  }
}
if (latestBlockTag) {
  gateway.rollup.latestBlockTag = latestBlockTag;
}

// how to configure prover
gateway.rollup.configure = (c: RollupCommitType<typeof gateway.rollup>) => {
  c.prover.printDebug = true;
  // c.prover.fast = false;
  // c.prover.maxStackSize = 5;
  // c.prover.maxUniqueProofs = 1;
  // c.prover.maxSuppliedBytes = 256;
  // c.prover.maxEvalDepth = 0;
};

const config: Record<string, any> = {
  gateway: gateway.constructor.name,
  rollup: gateway.rollup.constructor.name,
  chain1: chainName(gateway.rollup.provider1._network.chainId),
  chain2: chainName(gateway.rollup.provider2._network.chainId),
  since: new Date(),
  unfinalized: gateway.rollup.unfinalized,
  prefetch,
  ...toJSON(gateway),
  ...toJSON({ ...gateway.rollup, getLogsStepSize: undefined }),
};

if (gateway.rollup instanceof TrustedRollup) {
  config.signer = gateway.rollup.signerAddress;
}

console.log('Listening on', port, config);
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
        const commits = [commit];
        if (gateway instanceof Gateway) {
          for (const p of await Promise.allSettled(
            Array.from(gateway.commitCacheMap.cachedKeys(), (i) =>
              gateway.commitCacheMap.cachedValue(i)
            )
          )) {
            if (p.status === 'fulfilled' && p.value && p.value !== commit) {
              commits.push(p.value);
            }
          }
        }
        return Response.json({
          ...config,
          prover: toJSON({
            ...commit.prover,
            block: undefined,
            batchIndex: undefined,
            cache: {
              fetches: commit.prover.cache.maxCached,
              proofs: commit.prover.proofLRU.max,
            },
          }),
          commits: commits.map((c) => ({
            ...toJSON(c),
            fetches: c.prover.cache.cachedSize,
            proofs: c.prover.proofLRU.size,
            // cache: Object.fromEntries(
            //   Array.from(c.prover.proofMap(), ([k, v]) => [
            //     k,
            //     v.map(bigintToJSON),
            //   ])
            // ),
          })),
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

async function createGateway(name: string) {
  const match = name.match(/^trusted:(.+)$/i);
  if (match) {
    const slug = match[1].toUpperCase().replaceAll('-', '_');
    if (slug in CHAINS) {
      const chain = CHAINS[slug as keyof typeof CHAINS];
      const provider = createProvider(chain);
      const key = new SigningKey(signingKey);
      switch (chain) {
        case CHAINS.ZKSYNC:
        case CHAINS.ZKSYNC_SEPOLIA:
          return new Gateway(new TrustedRollup(provider, ZKSyncProver, key));
        // NOTE: linea should use eth_getProof instead of linea_getProof
        // NOTE: this probably needs "--latest" cli option too
        // rollup => SMT w/Mimc root using linea_getProof
        // chain => PMT w/Keccak root using eth_getProof
        // case CHAINS.LINEA:
        // case CHAINS.LINEA_SEPOLIA:
        //   return LineaProver;
        default:
          return new Gateway(new TrustedRollup(provider, EthProver, key));
      }
    }
  }
  switch (name) {
    case 'op':
      return createOPFaultGateway(OPFaultRollup.mainnetConfig);
    case 'unfinalized-op':
      return createOPFaultGateway({
        ...OPFaultRollup.mainnetConfig,
        minAgeSec: 1,
      });
    case 'op-sepolia':
      return createOPFaultGateway(OPFaultRollup.sepoliaConfig);
    case 'unfinalized-op-sepolia':
      return createOPFaultGateway({
        ...OPFaultRollup.sepoliaConfig,
        minAgeSec: 1,
      });
    case 'reverse-op': {
      const config = ReverseOPRollup.mainnetConfig;
      return new Gateway(
        new ReverseOPRollup(createProviderPair(config), config)
      );
    }
    case 'arb1': {
      const config = NitroRollup.arb1MainnetConfig;
      return new Gateway(new NitroRollup(createProviderPair(config), config));
    }
    case 'unfinalized-arb1': {
      const config = NitroRollup.arb1MainnetConfig;
      return new Gateway(
        new NitroRollup(createProviderPair(config), {
          ...config,
          minAgeBlocks: 1,
        })
      );
    }
    case 'arb1-sepolia': {
      const config = NitroRollup.arb1SepoliaConfig;
      return new Gateway(new NitroRollup(createProviderPair(config), config));
    }
    case 'unfinalized-arb1-sepolia': {
      const config = NitroRollup.arb1SepoliaConfig;
      return new Gateway(
        new NitroRollup(createProviderPair(config), {
          ...config,
          minAgeBlocks: 1,
        })
      );
    }
    case 'linea': {
      const config = LineaRollup.mainnetConfig;
      return new Gateway(new LineaRollup(createProviderPair(config), config));
    }
    case 'unfinalized-linea': {
      const config = LineaRollup.mainnetConfig;
      return new Gateway(
        new UnfinalizedLineaRollup(createProviderPair(config), config, 0)
      );
    }
    case 'lineaV1': {
      const config = LineaRollup.mainnetConfig;
      return new LineaGatewayV1(
        new LineaRollup(createProviderPair(config), config)
      );
    }
    case 'linea-sepolia': {
      const config = LineaRollup.sepoliaConfig;
      return new Gateway(new LineaRollup(createProviderPair(config), config));
    }
    case 'unfinalized-linea-sepolia': {
      const config = LineaRollup.sepoliaConfig;
      return new Gateway(
        new UnfinalizedLineaRollup(createProviderPair(config), config, 0)
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
      return new Gateway(new ScrollRollup(createProviderPair(config), config));
    }
    case 'scroll-sepolia': {
      const config = ScrollRollup.sepoliaConfig;
      return new Gateway(new ScrollRollup(createProviderPair(config), config));
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
    case 'base':
      return createOPFaultGateway(OPFaultRollup.baseMainnetConfig);
    case 'unfinalized-base':
      return createOPFaultGateway({
        ...OPFaultRollup.baseMainnetConfig,
        minAgeSec: 1,
      });
    case 'base-sepolia':
      return createOPFaultGateway(OPFaultRollup.baseSepoliaConfig);
    case 'unfinalized-base-sepolia':
      return createOPFaultGateway({
        ...OPFaultRollup.baseSepoliaConfig,
        minAgeSec: 1,
      });
    case 'unfinalized-ape': {
      const config12 = { ...NitroRollup.arb1MainnetConfig, minAgeBlocks: 1 };
      const config23 = { ...NitroRollup.apeMainnetConfig, minAgeBlocks: 1 };
      return new Gateway(
        new DoubleNitroRollup(
          new NitroRollup(createProviderPair(config12), config12),
          createProvider(config23.chain2),
          config23
        )
      );
    }
    case 'blast':
      return createOPGateway(OPRollup.blastMainnnetConfig);
    case 'celo-alfajores':
      return createOPGateway(OPRollup.celoAlfajoresConfig);
    case 'cyber':
      return createOPGateway(OPRollup.cyberMainnetConfig);
    case 'fraxtal':
      return createOPGateway(OPRollup.fraxtalMainnetConfig);
    case 'mantle':
      return createOPGateway(OPRollup.mantleMainnetConfig);
    case 'mode':
      return createOPGateway(OPRollup.modeMainnetConfig);
    case 'opbnb':
      return createOPGateway(OPRollup.opBNBMainnetConfig);
    case 'redstone':
      return createOPGateway(OPRollup.redstoneMainnetConfig);
    case 'shape':
      return createOPGateway(OPRollup.shapeMainnetConfig);
    case 'zora':
      return createOPGateway(OPRollup.zoraMainnetConfig);
    case 'self-eth':
      return createSelfGateway(CHAINS.MAINNET);
    case 'self-sepolia':
      return createSelfGateway(CHAINS.SEPOLIA);
    case 'self-holesky':
      return createSelfGateway(CHAINS.HOLESKY);
    default:
      throw new Error(`unknown gateway: ${name}`);
  }
}

function createSelfGateway(chain: Chain) {
  return new Gateway(new EthSelfRollup(createProvider(chain)));
}

function createOPGateway(config: RollupDeployment<OPConfig>) {
  return new Gateway(new OPRollup(createProviderPair(config), config));
}

function createOPFaultGateway(config: RollupDeployment<OPFaultConfig>) {
  return new Gateway(new OPFaultRollup(createProviderPair(config), config));
}

function toJSON(x: object) {
  const info: Record<string, any> = {};
  for (const [k, v] of Object.entries(x)) {
    if (v instanceof Contract) {
      info[k] = v.target;
    } else {
      switch (typeof v) {
        case 'bigint': {
          info[k] = bigintToJSON(v);
          break;
        }
        case 'string':
        case 'boolean':
        case 'number':
          info[k] = v;
          break;
      }
    }
  }
  return info;
}

function bigintToJSON(x: bigint) {
  const i = Number(x);
  return Number.isSafeInteger(i) ? i : toUnpaddedHex(x);
}
