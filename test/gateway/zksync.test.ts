import { ZKSyncRollup } from '../../src/zksync/ZKSyncRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { createProviderPair, providerURL } from '../providers.js';
import { setupTests, pairName } from './common.js';
import { describe } from '../bun-describe-fix.js';
import { afterAll } from 'bun:test';

const config = ZKSyncRollup.mainnetConfig;
describe(pairName(config), async () => {
  const rollup = new ZKSyncRollup(createProviderPair(config), config);
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: false,
    infiniteCallGas: true, // Blake2s is ~12m gas per proof!
  });
  afterAll(() => foundry.shutdown());
  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, { protocol: 'raw', log: false });
  afterAll(() => ccip.http.close());
  const GatewayProver = await foundry.deploy({ file: 'GatewayProver' });
  const ZKSyncSMT = await foundry.deploy({ file: 'ZKSyncSMT' });
  const hooks = await foundry.deploy({
    file: 'ZKSyncTrieHooks',
    args: [ZKSyncSMT],
  });
  const verifier = await foundry.deploy({
    file: 'ZKSyncVerifier',
    args: [[ccip.endpoint], rollup.defaultWindow, hooks, rollup.DiamondProxy],
    libs: { GatewayProver },
  });
  await setupTests(verifier, {
    // https://explorer.zksync.io/address/0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc#contract
    slotDataContract: '0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc',
  });
});
