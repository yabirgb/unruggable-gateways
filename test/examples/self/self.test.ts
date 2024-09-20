import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { EthSelfGateway } from '../../../src/eth/EthSelfGateway.js';
import { deployProxy } from '../../gateway/common.js';
import { describe } from '../../bun-describe-fix.js';
import { expect, test } from 'bun:test';

describe('self', async (afterAll) => {
  const foundry = await Foundry.launch({
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const gateway = new EthSelfGateway(foundry.provider);
  const ccip = await serve(gateway, {
    protocol: 'raw',
    log: false,
  });
  afterAll(() => ccip.http.close());

  // setup verifier
  const verifier = await foundry.deploy({ file: 'EthSelfVerifier' });
  const proxy = await deployProxy(foundry, verifier);
  await foundry.confirm(proxy.setGatewayURLs([ccip.endpoint]));

  // setup backend contract (L2)
  const backend = await foundry.deploy({ file: 'Backend' });
  await foundry.confirm(backend.set(1, 'chonk'));
  await foundry.confirm(backend.set(2, 'raffy'));

  // setup frontend contract (L1)
  const frontend = await foundry.deploy({
    file: 'Frontend',
    args: [proxy, backend],
  });

  test('key = 0', async () => {
    expect(frontend.get(0, { enableCcipRead: true })).resolves.toEqual('');
  });
  test('key = 1', async () => {
    expect(frontend.get(1, { enableCcipRead: true })).resolves.toEqual('chonk');
  });
  test('key = 2', async () => {
    expect(frontend.get(2, { enableCcipRead: true })).resolves.toEqual('raffy');
  });
});
