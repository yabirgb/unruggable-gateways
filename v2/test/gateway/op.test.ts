import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { createProviderPair, providerURL } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('op', async () => {
  const config = OPFaultRollup.mainnetConfig;
  const rollup = await OPFaultRollup.create(createProviderPair(config), config);
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, {
    protocol: 'raw',
    port: 0,
    log: false,
  });
  afterAll(() => ccip.http.close());
  const commit = await gateway.getLatestCommit();
  const verifier = await foundry.deploy({
    // OPFaultVerifier is too slow in fork mode (30sec+)
    file: 'FixedOPFaultVerifier',
    args: [
      [ccip.endpoint],
      rollup.defaultWindow,
      rollup.OptimismPortal,
      rollup.gameTypes,
      commit.index,
    ],
  });
  // https://optimistic.etherscan.io/address/0xf9d79d8c09d24e0C47E32778c830C545e78512CF
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0xf9d79d8c09d24e0C47E32778c830C545e78512CF'],
  });
  runSlotDataTests(reader);
});
