import { Foundry } from '@adraffy/blocksmith';
import { serve } from '@resolverworks/ezccip';
import { OPRollup } from '../../../src/op/OPRollup.js';
import { Gateway } from '../../../src/gateway.js';
import { ethers } from 'ethers';
import { providerURL, createProvider } from '../../providers.js';
import { afterAll, describe, test, expect } from 'bun:test';
import { solidityFollowSlot } from '../../../src/vm.js';

describe('TeamNick', async () => {
  const config = OPRollup.baseMainnetConfig;

  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());

  const rollup = new OPRollup(
    {
      provider1: foundry.provider,
      provider2: createProvider(config.chain2),
    },
    config
  );
  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, { protocol: 'raw', log: false });
  afterAll(() => ccip.http.close());

  const verifier = await foundry.deploy({
    file: 'OPVerifier',
    args: [[ccip.endpoint], rollup.defaultWindow, rollup.L2OutputOracle],
  });

  const ENS = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
  const NODE = ethers.namehash('teamnick.eth');
  const SLOT = solidityFollowSlot(0, NODE) + 1n;

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
    expect(ens.resolver(NODE)).resolves.toStrictEqual(teamnick.target);
  });

  test('basename', async () => {
    const resolver = await foundry.provider.getResolver('teamnick.eth');
    expect(resolver).toBeDefined();
    expect(resolver!.getAddress(Number(config.chain2))).resolves.toStrictEqual(
      '0x7C6EfCb602BC88794390A0d74c75ad2f1249A17f'
    );
    expect(resolver!.getText('url')).resolves.toStrictEqual(
      'https://teamnick.xyz'
    );
    expect(resolver!.getText('description')).resolves.toMatch(
      /^\d+ names registered$/
    );
  });

  test('raffy', async () => {
    const resolver = await foundry.provider.getResolver('raffy.teamnick.eth');
    expect(resolver).toBeDefined();
    expect(resolver!.getAddress()).resolves.toStrictEqual(
      '0x51050ec063d393217B436747617aD1C2285Aeeee'
    );
    expect(resolver!.getAvatar()).resolves.toStrictEqual(
      'https://raffy.antistupid.com/ens.jpg'
    );
  });

  test('slobo', async () => {
    const resolver = await foundry.provider.getResolver('slobo.teamnick.eth');
    expect(resolver).toBeDefined();
    expect(resolver!.getAddress()).resolves.toStrictEqual(
      '0x534631Bcf33BDb069fB20A93d2fdb9e4D4dD42CF'
    );
    expect(resolver!.getAvatar()).resolves.toStrictEqual(
      'https://cdn.pixabay.com/photo/2012/05/04/10/17/sun-47083_1280.png'
    );
  });

  test('does-not-exist1234', async () => {
    const resolver = await foundry.provider.getResolver(
      'does-not-exist1234.teamnick.eth'
    );
    expect(resolver).toBeDefined();
    expect(resolver!.getAddress()).resolves.toBeNull();
    expect(resolver!.getAvatar()).resolves.toBeNull();
  });
});
