import { PolygonGateway } from '../../src/gateway/PolygonGateway.js';

import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import {
  createProvider,
  providerURL,
  CHAIN_POLYGON,
} from '../../src/providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('polygon', async () => {
  const foundry = await Foundry.launch({
    fork: providerURL(137),
    infoLog: true,
    procLog: true,
  });
  afterAll(() => foundry.shutdown());
  const gateway = PolygonGateway.polygonMainnet({
    provider1: foundry.provider,
    provider2: createProvider(CHAIN_POLYGON),
    commitDelay: 0,
  });
  const ccip = await serve(gateway, { protocol: 'raw', port: 0 });
  afterAll(() => ccip.http.close());
  const verifier = await foundry.deploy({
    file: 'PolygonVerifier',
    args: [[ccip.endpoint], gateway.PolygonRollup],
  });

  //https://polygonscan.com/address/0xc695404735e0f1587a5398a06cab34d7d7b009da#code
  const SLOT_DATA_CONTRACT_ADDRESS = '0xc695404735e0f1587a5398a06cab34d7d7b009da';

  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, SLOT_DATA_CONTRACT_ADDRESS],
  });
  runSlotDataTests(reader);
});
