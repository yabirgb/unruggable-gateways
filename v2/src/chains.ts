import { Network } from 'ethers';
import type { Chain } from './types.js';

// export const CHAINS: { readonly [key: string]: Chain } = {
//   MAINNET: 1n,
// };

export const CHAIN_MAINNET: Chain = 1n;
export const CHAIN_SEPOLIA: Chain = 11155111n;
export const CHAIN_OP: Chain = 10n;
export const CHAIN_OP_SEPOLIA: Chain = 11155420n;
export const CHAIN_ZKSYNC: Chain = 324n;
export const CHAIN_ZKSYNC_SEPOLIA: Chain = 300n;
export const CHAIN_BASE: Chain = 8453n;
export const CHAIN_BASE_SEPOLIA: Chain = 84532n;
export const CHAIN_ARB1: Chain = 42161n;
export const CHAIN_ARB_NOVA: Chain = 42170n;
export const CHAIN_ARB_SEPOLIA: Chain = 421614n;
export const CHAIN_TAIKO: Chain = 167000n;
export const CHAIN_SCROLL: Chain = 534352n;
export const CHAIN_SCROLL_SEPOLIA: Chain = 534351n;
export const CHAIN_ZKEVM: Chain = 1101n;
export const CHAIN_ZKEVM_CARDONA: Chain = 2442n;
export const CHAIN_LINEA: Chain = 59144n;
export const CHAIN_LINEA_SEPOLIA: Chain = 59141n;

function registerNetworkName(chain: Chain, name: string) {
  // 20240809: ethers bug, injectCommonNetworks() only called on from()
  const network = Network.from(chain);
  try {
    Network.register(chain, () => new Network(name, chain));
  } catch (err) {
    console.log(`Chain(${chain}) already defined: ${name} => ${network.name}`);
  }
}

registerNetworkName(CHAIN_SCROLL, 'scroll');
registerNetworkName(CHAIN_SCROLL_SEPOLIA, 'scroll-sepolia');
registerNetworkName(CHAIN_TAIKO, 'taiko');
registerNetworkName(CHAIN_ZKSYNC, 'zksync');
registerNetworkName(CHAIN_ZKSYNC_SEPOLIA, 'zksync-sepolia');
registerNetworkName(CHAIN_ZKEVM, 'zkevm');
registerNetworkName(CHAIN_ZKEVM_CARDONA, 'zkevm-cardonia');
registerNetworkName(CHAIN_ARB_NOVA, 'arb-nova');
