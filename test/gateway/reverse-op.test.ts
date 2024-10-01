import { OPReverseRollup } from '../../src/op/OPReverseRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { providerURL, createProviderPair } from '../providers.js';
import { setupTests, pairName } from './common.js';
import { describe } from '../bun-describe-fix.js';
import { afterAll } from 'bun:test';

const config = OPReverseRollup.mainnetConfig;
describe.skipIf(!!process.env.IS_CV)(pairName(config, true), async () => {
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain2),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const rollup = new OPReverseRollup(createProviderPair(config), config);
  // NOTE: prove against prefork block, since state diverged on our fork
  rollup.latestBlockTag = (await foundry.provider.getBlockNumber()) - 5;
  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, { protocol: 'raw', log: false });
  afterAll(() => ccip.http.close());
  const GatewayProver = await foundry.deploy({ file: 'GatewayProver' });
  const hooks = await foundry.deploy({ file: 'EthTrieHooks' });
  const verifier = await foundry.deploy({
    file: 'OPReverseVerifier',
    args: [[ccip.endpoint], rollup.defaultWindow, hooks, rollup.L1Block],
    libs: { GatewayProver },
  });
  await setupTests(verifier, {
    // https://etherscan.io/address/0xC9D1E777033FB8d17188475CE3D8242D1F4121D5#code
    slotDataContract: '0xC9D1E777033FB8d17188475CE3D8242D1F4121D5',
  });
});
