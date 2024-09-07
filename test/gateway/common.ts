import type { HexAddress } from '../../src/types.js';
import type { RollupDeployment } from '../../src/rollup.js';
import { Contract } from 'ethers';
import { Gateway } from '../../src/gateway.js';
import { createProviderPair, providerURL, chainName } from '../providers.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { describe, afterAll } from 'bun:test';
import { runSlotDataTests } from './tests.js';
import { type OPConfig, OPRollup } from '../../src/op/OPRollup.js';
import {
  type OPFaultConfig,
  OPFaultRollup,
} from '../../src/op/OPFaultRollup.js';

export async function deployProxy(foundry: Foundry, verifier: Contract) {
  const wallet = foundry.wallets.admin;
  const proxy = await foundry.deploy({
    import:
      '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol',
    args: [verifier, wallet, '0x'],
  });
  return new Contract(proxy.target, verifier.interface, wallet);
}

export function testOP(
  config: RollupDeployment<OPConfig>,
  slotDataReaderAddress: HexAddress,
  minor = false
) {
  describe.skipIf(minor && !!process.env.IS_CI)(
    chainName(config.chain2),
    async () => {
      const rollup = new OPRollup(createProviderPair(config), config);
      const foundry = await Foundry.launch({
        fork: providerURL(config.chain1),
        infoLog: false,
      });
      afterAll(() => foundry.shutdown());
      const gateway = new Gateway(rollup);
      const ccip = await serve(gateway, {
        protocol: 'raw',
        log: false,
      });
      afterAll(() => ccip.http.close());
      const verifier = await foundry.deploy({ file: 'OPVerifier' });
      const proxy = await deployProxy(foundry, verifier);
      await foundry.confirm(proxy.setGatewayURLs([ccip.endpoint]));
      await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
      await foundry.confirm(proxy.setOracle(rollup.L2OutputOracle));
      const reader = await foundry.deploy({
        file: 'SlotDataReader',
        args: [proxy, slotDataReaderAddress],
      });
      runSlotDataTests(reader);
    }
  );
}

export function testOPFault(
  config: RollupDeployment<OPFaultConfig>,
  slotDataReaderAddress: HexAddress,
  minor = false
) {
  describe.skipIf(minor && !!process.env.IS_CI)(
    chainName(config.chain2),
    async () => {
      const rollup = await OPFaultRollup.create(
        createProviderPair(config),
        config
      );
      const foundry = await Foundry.launch({
        fork: providerURL(config.chain1),
        infoLog: false,
      });
      afterAll(() => foundry.shutdown());
      const gateway = new Gateway(rollup);
      const ccip = await serve(gateway, {
        protocol: 'raw',
        log: false,
      });
      afterAll(() => ccip.http.close());
      const commit = await gateway.getLatestCommit();
      const gameFinder = await foundry.deploy({
        file: 'FixedOPFaultGameFinder',
        args: [commit.index],
      });
      const verifier = await foundry.deploy({
        file: 'OPFaultVerifier',
        args: [gameFinder],
      });
      const proxy = await deployProxy(foundry, verifier);
      await foundry.confirm(proxy.setGatewayURLs([ccip.endpoint]));
      await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
      await foundry.confirm(proxy.setPortal(rollup.OptimismPortal));
      const reader = await foundry.deploy({
        file: 'SlotDataReader',
        args: [proxy, slotDataReaderAddress],
      });
      runSlotDataTests(reader);
    }
  );
}
