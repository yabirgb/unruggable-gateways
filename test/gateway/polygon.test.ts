import { PolygonPoSRollup } from '../../src/polygon/PolygonPoSRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { chainName, createProviderPair, providerURL } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { deployProxy } from './common.js';
import { describe } from '../bun-describe-fix.js';
import { afterAll } from 'bun:test';

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
  const verifier = await foundry.deploy({ file: 'PolygonPoSVerifier' });
  const proxy = await deployProxy(foundry, verifier);
  await foundry.confirm(proxy.setGatewayURLs([ccip.endpoint]));
  await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
  await foundry.confirm(proxy.setRootChain(rollup.RootChain.target));
  await foundry.confirm(proxy.setPoster(rollup.poster.address));
  // https://polygonscan.com/address/0x5BBf0fD3Dd8252Ee03bA9C03cF92F33551584361#code
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [proxy, '0x5BBf0fD3Dd8252Ee03bA9C03cF92F33551584361'],
  });
  runSlotDataTests(reader);
});
