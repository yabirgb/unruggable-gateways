import { ScrollGateway } from '../../src/scroll/ScrollGateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { providerURL, createProviderPair } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('scroll', async () => {
  const config = ScrollGateway.mainnetConfig;
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const gateway = new ScrollGateway({
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
    file: 'ScrollVerifier',
    args: [
      [ccip.endpoint],
      gateway.supportedWindow,
      gateway.ScrollChainCommitmentVerifier,
    ],
  });
  // https://scrollscan.com/address/0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF#code
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF'],
  });
  runSlotDataTests(reader, true);
});
