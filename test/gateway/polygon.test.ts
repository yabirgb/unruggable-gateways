import { PolygonPoSRollup } from '../../src/polygon/PolygonPoSRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { chainName, createProviderPair, providerURL } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';

const config = PolygonPoSRollup.mainnetConfig;
describe(chainName(config.chain2), async () => {
  const rollup = new PolygonPoSRollup(createProviderPair(config), config);
  rollup.configure = (c) => {
    c.prover.proofRetryCount = 5; // hack for failing eth_getProof
  };
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
    file: 'PolygonPoSVerifier',
    args: [[ccip.endpoint], rollup.defaultWindow, rollup.RootChain],
  });
  await foundry.confirm(verifier.togglePoster(rollup.poster.address, true));
  // https://polygonscan.com/address/0x5BBf0fD3Dd8252Ee03bA9C03cF92F33551584361#code
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x5BBf0fD3Dd8252Ee03bA9C03cF92F33551584361'],
  });
  runSlotDataTests(reader);
});
