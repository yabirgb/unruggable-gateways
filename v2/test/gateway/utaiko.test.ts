import { TaikoGateway } from '../../src/gateway/TaikoGateway.js';
import { UnverifiedTaikoGateway } from '../../src/gateway/UnverifiedTaikoGateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { providerURL, CHAIN_TAIKO, createProvider } from '../providers.js';
import { runSlotDataTests, LOG_CCIP } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('unverified taiko', async () => {
  const foundry = await Foundry.launch({
    fork: providerURL(1),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const gateway = UnverifiedTaikoGateway.default({
    provider1: foundry.provider,
    provider2: createProvider(CHAIN_TAIKO),
  });
  const ccip = await serve(gateway, {
    protocol: 'raw',
    port: 0,
    log: LOG_CCIP,
  });
  afterAll(() => ccip.http.close());
  const verifier = await foundry.deploy({
    file: 'UnverifiedTaikoVerifier',
    args: [
      [ccip.endpoint],
      TaikoGateway.mainnetConfig().TaikoL1,
      gateway.blockDelay,
      gateway.commitStep,
    ],
  });
  // https://taikoscan.io/address/0xAF7f1Fa8D5DF0D9316394433E841321160408565#code
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0xAF7f1Fa8D5DF0D9316394433E841321160408565'],
  });
  runSlotDataTests(reader, true);
});
