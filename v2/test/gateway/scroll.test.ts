import { ScrollRollup } from '../../src/scroll/ScrollRollup.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { providerURL, createProviderPair } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';
import { Gateway } from '../../src/gateway.js';

describe('scroll', async () => {
  const config = ScrollRollup.mainnetConfig;
  const rollup = await ScrollRollup.create(createProviderPair(config), config);
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
    file: 'ScrollVerifier',
    args: [[ccip.endpoint], rollup.defaultWindow, rollup.CommitmentVerifier],
  });
  // https://scrollscan.com/address/0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF#code
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF'],
  });
  runSlotDataTests(reader, true);
});
