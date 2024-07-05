import type { Provider, ProviderPair } from './types.js';
import {
  Network,
  AlchemyProvider,
  InfuraProvider,
  JsonRpcProvider,
} from 'ethers';

export const CHAIN_OP = 10;
export const CHAIN_POLYGON = 137;
export const CHAIN_BASE = 8453;
export const CHAIN_ARB1 = 42161;
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
  switch (chain) {
    case 1:
      return 'https://cloudflare-eth.com';
    case CHAIN_OP:
      return 'https://mainnet.optimism.io';
    case CHAIN_BASE:
      return 'https://mainnet.base.org';
    case CHAIN_ARB1:
      return 'https://arb1.arbitrum.io/rpc';
    case CHAIN_SCROLL:
      return 'https://rpc.scroll.io/';
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
