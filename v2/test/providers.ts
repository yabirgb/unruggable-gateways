import type { Provider, ProviderPair } from '../src/types.js';
import {
  Network,
  AlchemyProvider,
  InfuraProvider,
  JsonRpcProvider,
} from 'ethers';

export const CHAIN_OP = 10;
export const CHAIN_BASE = 8453;
export const CHAIN_ARB1 = 42161;
export const CHAIN_TAIKO = 167000;
export const CHAIN_SCROLL = 534352;

function register(chain: number, name: string) {
  try {
    Network.register(chain, () => new Network(name, chain));
  } catch (err) {
    /*empty*/
  }
}
register(CHAIN_SCROLL, 'scroll');

export function providerURL(chain: number): string {
  let key = process.env.INFURA_KEY;
  if (key) {
    try {
      return InfuraProvider.getRequest(Network.from(chain), key).url;
    } catch (err) {
      /*empty*/
    }
  }
  key = process.env.ALCHEMY_KEY;
  if (key) {
    try {
      return AlchemyProvider.getRequest(Network.from(chain), key).url;
    } catch (err) {
      //Unsupported chain errors will be caught e.g. 27/07/24 Alchemy does not support Scroll
      //Will fall through to public RPC
    }
  }
  // 20240713: might be better to use the ankr public rpcs, eg. https://eth.public-rpc.com/
  switch (chain) {
    case 1:
      // https://developers.cloudflare.com/web3/ethereum-gateway/
      return 'https://cloudflare-eth.com';
    case CHAIN_OP:
      // https://docs.optimism.io/chain/networks#op-mainnet
      return 'https://mainnet.optimism.io';
    case CHAIN_BASE:
      // https://docs.base.org/docs/network-information#base-mainnet
      return 'https://mainnet.base.org';
    case CHAIN_ARB1:
      // https://docs.arbitrum.io/build-decentralized-apps/reference/node-providers#arbitrum-public-rpc-endpoints
      return 'https://arb1.arbitrum.io/rpc';
    case CHAIN_SCROLL:
      // https://docs.scroll.io/en/developers/developer-quickstart/#scroll-mainnet
      return 'https://rpc.scroll.io/';
    case CHAIN_TAIKO:
      // https://docs.taiko.xyz/network-reference/rpc-configuration#taiko-mainnet
      return 'https://rpc.mainnet.taiko.xyz';
  }
  throw Object.assign(new Error('unknown provider'), { chain });
}

export function createProvider(chain: number): Provider {
  return new JsonRpcProvider(providerURL(chain), chain, {
    staticNetwork: true,
  });
}

export function createProviderPair(a: number, b?: number): ProviderPair {
  if (!b) {
    b = a;
    a = 1;
  }
  return {
    provider1: createProvider(a),
    provider2: createProvider(b),
  };
}
