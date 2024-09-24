import { LineaRollup } from '../../src/linea/LineaRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { createProviderPair, providerURL } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { deployProxy, pairName } from './common.js';
import { describe } from '../bun-describe-fix.js';
import { afterAll } from 'bun:test';

const config = LineaRollup.mainnetConfig;
describe(pairName(config), async () => {
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
  const verifier = await foundry.deploy({
    file: 'LineaVerifier',
    libs: {
      SparseMerkleProof: config.SparseMerkleProof,
    },
  });
  const proxy = await deployProxy(foundry, verifier);
  await foundry.confirm(proxy.setGatewayURLs([ccip.endpoint]));
  await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
  await foundry.confirm(proxy.setRollup(rollup.L1MessageService));
  // https://lineascan.build/address/0x48F5931C5Dbc2cD9218ba085ce87740157326F59#code
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [proxy, '0x48F5931C5Dbc2cD9218ba085ce87740157326F59'],
  });
  runSlotDataTests(reader);
});
