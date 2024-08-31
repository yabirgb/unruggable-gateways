import type { RollupDeployment } from '../rollup.js';
import type { HexAddress } from '../types.js';
import { CHAINS } from '../chains.js';

export type PolygonZKConfig = {
  RollupManager: HexAddress;
};

export class PolygonZKRollup {
  static readonly mainnetConfig = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.POLYGON_ZKEVM,
    // https://docs.polygon.technology/zkEVM/architecture/high-level/smart-contracts/addresses/#mainnet-contracts
    RollupManager: '0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2',
  } as const satisfies RollupDeployment<PolygonZKConfig>;

  static readonly testnetConfig = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.POLYGON_ZKEVM_CARDONA,
    // https://github.com/0xPolygonHermez/cdk-erigon/tree/zkevm#networks
    RollupManager: '0x32d33D5137a7cFFb54c5Bf8371172bcEc5f310ff',
  } as const satisfies RollupDeployment<PolygonZKConfig>;
}
