import { TaikoGateway } from '../../src/taiko/TaikoGateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { providerURL, createProviderPair } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('taiko', async () => {
  const config = TaikoGateway.mainnetConfig();
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const gateway = new TaikoGateway({
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
    file: 'TaikoVerifier',
    args: [[ccip.endpoint], gateway.supportedWindow, gateway.TaikoL1],
  });
  // https://taikoscan.io/address/0xAF7f1Fa8D5DF0D9316394433E841321160408565#code
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0xAF7f1Fa8D5DF0D9316394433E841321160408565'],
  });
  runSlotDataTests(reader, true);
});
