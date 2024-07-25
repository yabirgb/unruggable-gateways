import { Foundry } from '@adraffy/blocksmith';
import { serve } from '@resolverworks/ezccip';
import { OPGateway } from '../../../src/gateway/OPGateway.js';
import { ethers } from 'ethers';
import { providerURL, CHAIN_BASE, createProvider } from '../../providers.js';
import { afterAll, describe, test, expect } from 'bun:test';
import { solidityFollowSlot } from '../../../src/vm.js';

describe('TeamNick', async () => {
  const foundry = await Foundry.launch({ fork: providerURL(1) });
  afterAll(() => foundry.shutdown());

  const gateway = OPGateway.baseMainnet({
    provider1: foundry.provider,
    provider2: createProvider(CHAIN_BASE),
  });
  afterAll(() => gateway.shutdown());

  const ccip = await serve(gateway, { protocol: 'raw', port: 0 });
  afterAll(() => ccip.http.close());

  const verifier = await foundry.deploy({
    file: 'OPVerifier',
    args: [[ccip.endpoint], gateway.L2OutputOracle, gateway.blockDelay],
  });

  const ENS = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
  const NODE = ethers.namehash('teamnick.eth');
  const SLOT = solidityFollowSlot(0, NODE) + 1n;
  //const [SLOT] = await new EVMRequest(1).setTarget(ENS).push(NODE).follow().offset(1).pushSlot().setOutput(0).resolveWith();

  const teamnick = await foundry.deploy({
    file: 'TeamNick',
    args: [ENS, verifier],
  });

  // replace real teamnick resolver with fake
  await foundry.provider.send('anvil_setStorageAt', [
    ENS,
    ethers.toBeHex(SLOT, 32),
    ethers.toBeHex(teamnick.target, 32),
  ]);

  test('resolver was hijacked', async () => {
    const ens = new ethers.Contract(
      ENS,
      ['function resolver(bytes32 node) view returns (address)'],
      foundry.provider
    );
    expect(await ens.resolver(NODE)).toBe(teamnick.target);
  });

  test('basename', async () => {
    const resolver = await foundry.provider.getResolver('teamnick.eth');
    expect(resolver).toBeDefined();
    expect(await resolver!.getAddress(CHAIN_BASE)).toBe(
      '0x7C6EfCb602BC88794390A0d74c75ad2f1249A17f'
    );
    expect(await resolver!.getText('url')).toBe('https://teamnick.xyz');
    expect(await resolver!.getText('description')).toMatch(
      /^\d+ names registered$/
    );
  });

  test('raffy', async () => {
    const resolver = await foundry.provider.getResolver('raffy.teamnick.eth');
    expect(resolver).toBeDefined();
    expect(await resolver!.getAddress()).toBe(
      '0x51050ec063d393217B436747617aD1C2285Aeeee'
    );
    expect(await resolver!.getAvatar()).toBe(
      'https://raffy.antistupid.com/ens.jpg'
    );
  });

  test('slobo', async () => {
    const resolver = await foundry.provider.getResolver('slobo.teamnick.eth');
    expect(resolver).toBeDefined();
    expect(await resolver!.getAddress()).toBe(
      '0x534631Bcf33BDb069fB20A93d2fdb9e4D4dD42CF'
    );
    expect(await resolver!.getAvatar()).toBe(
      'https://cdn.pixabay.com/photo/2012/05/04/10/17/sun-47083_1280.png'
    );
  });

  test('does-not-exist1234', async () => {
    const resolver = await foundry.provider.getResolver(
      'does-not-exist1234.teamnick.eth'
    );
    expect(resolver).toBeDefined();
    expect(await resolver!.getAddress()).toBeNull();
    expect(await resolver!.getAvatar()).toBeNull();
  });
});
