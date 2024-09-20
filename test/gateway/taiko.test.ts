import { TaikoRollup } from '../../src/taiko/TaikoRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { providerURL, createProviderPair, chainName } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { deployProxy } from './common.js';
import { describe } from '../bun-describe-fix.js';

const config = TaikoRollup.mainnetConfig;
describe(chainName(config.chain2), async (afterAll) => {
  const rollup = await TaikoRollup.create(createProviderPair(config), config);
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
  const verifier = await foundry.deploy({ file: 'TaikoVerifier' });
  const proxy = await deployProxy(foundry, verifier);
  await foundry.confirm(proxy.setGatewayURLs([ccip.endpoint]));
  await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
  await foundry.confirm(proxy.setRollup(rollup.TaikoL1));
  // https://taikoscan.io/address/0xAF7f1Fa8D5DF0D9316394433E841321160408565#code
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [proxy, '0xAF7f1Fa8D5DF0D9316394433E841321160408565'],
  });
  runSlotDataTests(reader);
});
