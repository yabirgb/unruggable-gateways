import {
  CHAIN_MAINNET,
  CHAIN_SEPOLIA,
  CHAIN_POLYGON_ZKEVM,
  CHAIN_POLYGON_ZKEVM_CARDONA,
} from '../chains.js';
import type { RollupDeployment } from '../rollup.js';
import type { HexAddress } from '../types.js';

export type PolygonZKConfig = {
  RollupManager: HexAddress;
};

export class PolygonZKRollup {
  static readonly mainnetConfig: RollupDeployment<PolygonZKConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_POLYGON_ZKEVM,
    // https://docs.polygon.technology/zkEVM/architecture/high-level/smart-contracts/addresses/#mainnet-contracts
    RollupManager: '0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2',
  };
  static readonly testnetConfig: RollupDeployment<PolygonZKConfig> = {
    chain1: CHAIN_SEPOLIA,
    chain2: CHAIN_POLYGON_ZKEVM_CARDONA,
    // https://github.com/0xPolygonHermez/cdk-erigon/tree/zkevm#networks
    RollupManager: '0x32d33D5137a7cFFb54c5Bf8371172bcEc5f310ff',
  };
}
