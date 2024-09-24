import { ScrollRollup } from '../../src/scroll/ScrollRollup.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { providerURL, createProviderPair } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { Gateway } from '../../src/gateway.js';
import { deployProxy, pairName } from './common.js';
import { describe } from '../bun-describe-fix.js';
import { afterAll } from 'bun:test';

const config = ScrollRollup.mainnetConfig;
describe(pairName(config), async () => {
  const rollup = await ScrollRollup.create(createProviderPair(config), config);
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
  const verifier = await foundry.deploy({ file: 'ScrollVerifier' });
  const proxy = await deployProxy(foundry, verifier);
  await foundry.confirm(proxy.setGatewayURLs([ccip.endpoint]));
  await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
  await foundry.confirm(proxy.setCommitmentVerifier(rollup.CommitmentVerifier));
  // https://scrollscan.com/address/0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF#code
  // https://scrollscan.com/address/0x28507d851729c12F193019c7b05D916D53e9Cf57#code (pointer)
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [proxy, '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF'],
  });
  // experimental
  await foundry.confirm(
    reader.setPointer('0x28507d851729c12F193019c7b05D916D53e9Cf57')
  );
  runSlotDataTests(reader, true);
});
