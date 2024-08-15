import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { createProviderPair, providerURL } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('base testnet', async () => {
  const config = OPFaultRollup.baseTestnetConfig;
  const rollup = await OPFaultRollup.create(createProviderPair(config), config);
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, {
    protocol: 'raw',
    port: 0,
    log: false,
  });
  afterAll(() => ccip.http.close());
  const commit = await gateway.getLatestCommit();
  const helper = await foundry.deploy({
    file: 'OPFaultConstantHelper',
    args: [commit.index],
  });
  const verifier = await foundry.deploy({
    file: 'OPFaultVerifier',
    args: [
      [ccip.endpoint],
      config.suggestedWindow,
      rollup.OptimismPortal,
      helper,
    ],
  });
  // https://sepolia.basescan.org/address/0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411'],
  });
  runSlotDataTests(reader);
});
