import { LineaRollup } from '../../src/linea/LineaRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { createProviderPair, providerURL } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('linea', async () => {
  const config = LineaRollup.mainnetConfig;
  const rollup = new LineaRollup(createProviderPair(config), config);
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
  const verifier = await foundry.deploy({
    file: 'LineaVerifier',
    args: [[ccip.endpoint], config.suggestedWindow, rollup.L1MessageService],
    libs: {
      SparseMerkleProof: config.SparseMerkleProof,
    },
  });
  // https://lineascan.build/address/0x48F5931C5Dbc2cD9218ba085ce87740157326F59#code
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x48F5931C5Dbc2cD9218ba085ce87740157326F59'],
  });
  runSlotDataTests(reader);
});
