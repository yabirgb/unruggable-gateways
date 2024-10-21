import { NitroRollup } from '../../src/nitro/NitroRollup.js';
import { DoubleNitroRollup } from '../../src/nitro/DoubleNitroRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip/serve';
import { Foundry } from '@adraffy/blocksmith';
import {
  providerURL,
  createProviderPair,
  createProvider,
} from '../providers.js';
import { setupTests, testName } from './common.js';
import { afterAll } from 'bun:test';
import { describe } from '../bun-describe-fix.js';

// TODO: deployed 20241021, switched to finalized in 14 days (on 20241104)
// see: DoubleNitroRollup.ts

const config12 = { ...NitroRollup.arb1MainnetConfig, minAgeBlocks: 1 };
const config23 = { ...NitroRollup.apeMainnetConfig, minAgeBlocks: 1 };
describe.skipIf(!!process.env.IS_CI)(
  testName({ ...config12, chain3: config23.chain2 }, { unfinalized: true }),
  async () => {
    const rollup = new DoubleNitroRollup(
      new NitroRollup(createProviderPair(config12), config12),
      createProvider(config23.chain2),
      config23
    );
    const foundry = await Foundry.launch({
      fork: providerURL(config12.chain1),
      infoLog: false,
    });
    afterAll(foundry.shutdown);
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: false });
    afterAll(ccip.shutdown);
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'DoubleNitroVerifier',
      args: [
        [ccip.endpoint],
        rollup.defaultWindow,
        hooks,
        rollup.rollup12.Rollup,
        rollup.rollup12.minAgeBlocks,
        rollup.rollup23.Rollup,
        //rollup.rollup23.minAgeBlocks,
        rollup.nodeRequest.toTuple(),
      ],
      libs: { GatewayVM },
    });
    await setupTests(verifier, {
      // https://apescan.io/address/0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6#code
      slotDataContract: '0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6',
    });
  }
);
