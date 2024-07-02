import { ScrollGateway } from '../../src/gateway/ScrollGateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import {
  createProvider,
  providerURL,
  CHAIN_SCROLL,
} from '../../src/providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('scroll', async () => {
  const foundry = await Foundry.launch({
    fork: providerURL(1),
  });
  afterAll(() => foundry.shutdown());
  const gateway = ScrollGateway.mainnet({
    provider1: foundry.provider,
    provider2: createProvider(CHAIN_SCROLL),
    //commitDelay: 0 // use default since ScrollAPI indexer
  });
  const ccip = await serve(gateway, { protocol: 'raw', port: 0 });
  afterAll(() => ccip.http.close());
  const verifier = await foundry.deploy({
    file: 'ScrollVerifier',
    args: [
      [ccip.endpoint],
      gateway.ScrollChainCommitmentVerifier,
      gateway.commitDelay,
      gateway.commitStep,
    ],
  });
  // https://scrollscan.com/address/0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF#code
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF'],
  });
  runSlotDataTests(reader);
});
