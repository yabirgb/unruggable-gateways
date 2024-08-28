import type { Chain, ChainPair, Provider, ProviderPair } from '../src/types.js';
import { ethers } from 'ethers';
import {
  CHAIN_MAINNET,
  CHAIN_SEPOLIA,
  CHAIN_OP,
  CHAIN_OP_SEPOLIA,
  CHAIN_BASE,
  CHAIN_BASE_SEPOLIA,
  CHAIN_SCROLL,
  CHAIN_TAIKO,
  CHAIN_ZKSYNC,
  CHAIN_ZKSYNC_SEPOLIA,
  CHAIN_POLYGON_ZKEVM,
  CHAIN_POLYGON_ZKEVM_CARDONA,
  CHAIN_ARB1,
  CHAIN_ARB_NOVA,
  CHAIN_ARB_SEPOLIA,
  CHAIN_LINEA_SEPOLIA,
  CHAIN_LINEA,
  CHAIN_SCROLL_SEPOLIA,
} from '../src/chains.js';

export function providerURL(chain: Chain): string {
  type ProviderClass = {
    getRequest(network: ethers.Network, key: string): ethers.FetchRequest;
  };
  const ordering: [string, ProviderClass][] = [
    ['INFURA_KEY', ethers.InfuraProvider],
    ['ALCHEMY_KEY', ethers.AlchemyProvider],
    ['ANKR_KEY', ethers.AnkrProvider],
  ];
  const network = ethers.Network.from(chain);
  for (const [env, cls] of ordering) {
    const key = process.env[env];
    if (!key) continue;
    try {
      return cls.getRequest(network, key).url;
    } catch (err) {
      /*empty*/
    }
  }
  switch (chain) {
    case CHAIN_MAINNET:
      // https://developers.cloudflare.com/web3/ethereum-gateway/
      //return 'https://cloudflare-eth.com';
      // 20240713: might be better to use the ankr public rpcs
      return `https://rpc.ankr.com/eth`;
    case CHAIN_SEPOLIA:
      return `https://rpc.ankr.com/eth_sepolia`;
    case CHAIN_OP:
      // https://docs.optimism.io/chain/networks#op-mainnet
      return 'https://mainnet.optimism.io';
    case CHAIN_OP_SEPOLIA:
      // https://docs.optimism.io/chain/networks#op-sepolia
      return 'https://sepolia.optimism.io';
    case CHAIN_BASE:
      // https://docs.base.org/docs/network-information#base-mainnet
      return 'https://mainnet.base.org';
    case CHAIN_BASE_SEPOLIA:
      // https://docs.base.org/docs/network-information#base-testnet-sepolia
      return 'https://sepolia.base.org';
    case CHAIN_ARB1:
      // https://docs.arbitrum.io/build-decentralized-apps/reference/node-providers#arbitrum-public-rpc-endpoints
      return 'https://arb1.arbitrum.io/rpc';
    case CHAIN_ARB_NOVA:
      return 'https://nova.arbitrum.io/rpc';
    case CHAIN_ARB_SEPOLIA:
      return 'https://sepolia-rollup.arbitrum.io/rpc';
    case CHAIN_SCROLL:
      // https://docs.scroll.io/en/developers/developer-quickstart/#scroll-mainnet
      return 'https://rpc.scroll.io';
    case CHAIN_SCROLL_SEPOLIA:
      // https://docs.scroll.io/en/developers/developer-quickstart/#scroll-sepolia-testnet
      return 'https://sepolia-rpc.scroll.io';
    case CHAIN_TAIKO:
      // https://docs.taiko.xyz/network-reference/rpc-configuration#taiko-mainnet
      return 'https://rpc.mainnet.taiko.xyz';
    case CHAIN_ZKSYNC:
      // https://docs.zksync.io/build/connect-to-zksync#mainnet-network-details
      return 'https://mainnet.era.zksync.io';
    case CHAIN_ZKSYNC_SEPOLIA:
      // https://docs.zksync.io/build/connect-to-zksync#sepolia-testnet-network-details
      return 'https://sepolia.era.zksync.dev';
    case CHAIN_POLYGON_ZKEVM:
      // https://docs.polygon.technology/zkEVM/get-started/quick-start/#manually-add-network-to-wallet
      return 'https://zkevm.polygonscan.com';
    case CHAIN_POLYGON_ZKEVM_CARDONA:
      //return 'https://cardona-zkevm.polygonscan.com/';
      return 'https://rpc.cardona.zkevm-rpc.com';
    case CHAIN_LINEA:
      // https://docs.linea.build/developers/quickstart/info-contracts
      return 'https://rpc.linea.build';
    case CHAIN_LINEA_SEPOLIA:
      return 'https://rpc.sepolia.linea.build';
  }
  throw Object.assign(new Error('unknown provider'), { chain });
}

export function createProvider(chain: Chain): Provider {
  return new ethers.JsonRpcProvider(providerURL(chain), chain, {
    staticNetwork: true,
  });
}

export function createProviderPair(
  a: Chain | ChainPair,
  b?: Chain
): ProviderPair {
  if (typeof a !== 'bigint') {
    b = a.chain2;
    a = a.chain1;
  }
  if (!b) {
    // if only 1 chain is provided => (mainnet, chain)
    b = a;
    a = CHAIN_MAINNET;
  }
  return {
    provider1: createProvider(a),
    provider2: createProvider(b),
  };
}
