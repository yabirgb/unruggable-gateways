import { OPGateway } from '../../src/op/OPGateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { createProviderPair, providerURL } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('base', async () => {
  const config = OPGateway.baseMainnetConfig;
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const gateway = new OPGateway({
    ...createProviderPair(config),
    ...config,
  });
  const ccip = await serve(gateway, {
    protocol: 'raw',
    port: 0,
    log: false,
  });
  afterAll(() => ccip.http.close());
  const verifier = await foundry.deploy({
    file: 'OPVerifier',
    args: [[ccip.endpoint], gateway.supportedWindow, gateway.L2OutputOracle],
  });
  // https://basescan.org/address/0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6'],
  });
  runSlotDataTests(reader);
});
