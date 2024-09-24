import { EthSelfRollup } from '../../src/index.js';
import { CHAINS } from '../../src/chains.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { providerURL, chainName } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { Gateway } from '../../src/gateway.js';
import { deployProxy } from './common.js';
import { describe } from '../bun-describe-fix.js';
import { afterAll } from 'bun:test';

const chain = CHAINS.MAINNET;
//const chain = CHAINS.SEPOLIA;
describe(chainName(chain), async () => {
  const foundry = await Foundry.launch({
    fork: providerURL(chain),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const rollup = new EthSelfRollup(foundry.provider);
  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, {
    protocol: 'raw',
    log: false,
  });
  afterAll(() => ccip.http.close());
  const verifier = await foundry.deploy({ file: 'EthSelfVerifier' });
  const proxy = await deployProxy(foundry, verifier);
  await foundry.confirm(proxy.setGatewayURLs([ccip.endpoint]));
  await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
  // https://etherscan.io/address/0xC9D1E777033FB8d17188475CE3D8242D1F4121D5#code
  // https://sepolia.etherscan.io/address/0x494d872430442EdB6c1e05BB5521084Ad50312b2
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [proxy, '0xC9D1E777033FB8d17188475CE3D8242D1F4121D5'],
  });
  runSlotDataTests(reader);
});
