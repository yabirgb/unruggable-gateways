import type { ChainPair, HexAddress } from '../../src/types.js';
import type { RollupDeployment } from '../../src/rollup.js';
import { Contract } from 'ethers';
import { Gateway } from '../../src/gateway.js';
import { createProviderPair, providerURL } from '../providers.js';
import { chainName } from '../../src/chains.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { describe } from '../bun-describe-fix.js';
import { runSlotDataTests } from './tests.js';
import { type OPConfig, OPRollup } from '../../src/op/OPRollup.js';
import {
  type OPFaultConfig,
  OPFaultRollup,
} from '../../src/op/OPFaultRollup.js';
import { afterAll } from 'bun:test';

export function pairName(pair: ChainPair, reverse = false) {
  return `${chainName(pair.chain1)} ${reverse ? '<=' : '=>'} ${chainName(pair.chain2)}`;
}

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
  describe.skipIf(minor && !!process.env.IS_CI)(pairName(config), async () => {
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
  });
}

export function testOPFault(
  config: RollupDeployment<OPFaultConfig>,
  slotDataReaderAddress: HexAddress,
  minor = false
) {
  describe.skipIf(minor && !!process.env.IS_CI)(pairName(config), async () => {
    const rollup = new OPFaultRollup(createProviderPair(config), config);
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
  });
}
