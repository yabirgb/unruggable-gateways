import type { RollupDeployment } from '../rollup.js';
import type { HexAddress } from '../types.js';
import { CHAINS } from '../chains.js';

export type PolygonZKConfig = {
  RollupManager: HexAddress;
};

export class PolygonZKRollup {
  // https://docs.polygon.technology/zkEVM/architecture/high-level/smart-contracts/addresses/#mainnet-contracts
  static readonly mainnetConfig: RollupDeployment<PolygonZKConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.POLYGON_ZKEVM,
    RollupManager: '0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2',
  };
  // https://github.com/0xPolygonHermez/cdk-erigon/tree/zkevm#networks
  static readonly testnetConfig: RollupDeployment<PolygonZKConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.POLYGON_ZKEVM_CARDONA,
    RollupManager: '0x32d33D5137a7cFFb54c5Bf8371172bcEc5f310ff',
  };
}
