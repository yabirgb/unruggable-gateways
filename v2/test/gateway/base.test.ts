import { OPGateway } from '../../src/gateway/OPGateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import {
  createProvider,
  providerURL,
  CHAIN_BASE,
} from '../../src/providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('base', async () => {
  const foundry = await Foundry.launch({
    fork: providerURL(1),
  });
  afterAll(() => foundry.shutdown());
  const gateway = OPGateway.baseMainnet({
    provider1: foundry.provider,
    provider2: createProvider(CHAIN_BASE),
    commitDelay: 0,
  });
  const ccip = await serve(gateway, { protocol: 'raw', port: 0 });
  afterAll(() => ccip.http.close());
  const verifier = await foundry.deploy({
    file: 'OPVerifier',
    args: [[ccip.endpoint], gateway.L2OutputOracle, gateway.commitDelay],
  });
  // https://basescan.org/address/0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6'],
  });
  runSlotDataTests(reader);
});
