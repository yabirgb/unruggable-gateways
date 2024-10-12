import { LineaRollup } from '../../src/linea/LineaRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip/serve';
import { Foundry } from '@adraffy/blocksmith';
import { createProviderPair, providerURL } from '../providers.js';
import { setupTests, testName } from './common.js';
import { describe } from '../bun-describe-fix.js';
import { afterAll } from 'bun:test';

const config = LineaRollup.mainnetConfig;
describe(testName(config), async () => {
  const rollup = new LineaRollup(createProviderPair(config), config);
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
  const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
  const hooks = await foundry.deploy({
    file: 'LineaVerifierHooks',
    libs: {
      SparseMerkleProof: config.SparseMerkleProof,
    },
  });
  const verifier = await foundry.deploy({
    file: 'LineaVerifier',
    args: [
      [ccip.endpoint],
      rollup.defaultWindow,
      hooks,
      config.L1MessageService,
    ],
    libs: { GatewayVM },
  });
  await setupTests(verifier, {
    // https://lineascan.build/address/0x48F5931C5Dbc2cD9218ba085ce87740157326F59#code
    slotDataContract: '0x48F5931C5Dbc2cD9218ba085ce87740157326F59',
  });
});
