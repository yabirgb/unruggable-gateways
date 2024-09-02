import type { HexAddress } from '../../src/types.js';
import type { RollupDeployment } from '../../src/rollup.js';
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

export function testOP(
  config: RollupDeployment<OPConfig>,
  slotDataReaderAddress: HexAddress
) {
  describe(chainName(config.chain2), async () => {
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
    const verifier = await foundry.deploy({
      file: 'OPVerifier',
      args: [[ccip.endpoint], rollup.defaultWindow, rollup.L2OutputOracle],
    });
    const reader = await foundry.deploy({
      file: 'SlotDataReader',
      args: [verifier, slotDataReaderAddress],
    });
    runSlotDataTests(reader);
  });
}

export function testOPFault(
  config: RollupDeployment<OPFaultConfig>,
  slotDataReaderAddress: HexAddress
) {
  describe(chainName(config.chain2), async () => {
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
      args: [
        [ccip.endpoint],
        rollup.defaultWindow,
        rollup.OptimismPortal,
        gameFinder, // official is too slow in fork mode (30sec+)
        rollup.gameTypeBitMask,
      ],
    });
    const reader = await foundry.deploy({
      file: 'SlotDataReader',
      args: [verifier, slotDataReaderAddress],
    });
    runSlotDataTests(reader);
  });
}
