import { OPReverseRollup } from '../../src/op/OPReverseRollup.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { providerURL, chainName, createProviderPair } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { Gateway } from '../../src/gateway.js';
import { deployProxy } from './common.js';
import { describe } from '../bun-describe-fix.js';

const config = OPReverseRollup.mainnetConfig;
describe.skipIf(!!process.env.IS_CV)(
  chainName(config.chain1),
  async (afterAll) => {
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain2),
      infoLog: false,
    });
    afterAll(() => foundry.shutdown());
    const rollup = new OPReverseRollup(createProviderPair(config), config);
    rollup.latestBlockTag = (await foundry.provider.getBlockNumber()) - 4; // prove against prefork block
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, {
      protocol: 'raw',
      log: false,
    });
    afterAll(() => ccip.http.close());
    const verifier = await foundry.deploy({ file: 'OPReverseVerifier' });
    const proxy = await deployProxy(foundry, verifier);
    await foundry.confirm(proxy.setGatewayURLs([ccip.endpoint]));
    await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
    await foundry.confirm(proxy.setOracle(rollup.L1Block));
    // https://etherscan.io/address/0xC9D1E777033FB8d17188475CE3D8242D1F4121D5#code
    const reader = await foundry.deploy({
      file: 'SlotDataReader',
      args: [proxy, '0xC9D1E777033FB8d17188475CE3D8242D1F4121D5'],
    });
    runSlotDataTests(reader);
  }
);
