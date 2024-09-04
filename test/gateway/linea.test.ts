import { LineaRollup } from '../../src/linea/LineaRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { createProviderPair, providerURL } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';
import { ABI_CODER } from '../../src/utils.js';

describe('linea', async () => {
  const config = LineaRollup.mainnetConfig;
  const rollup = new LineaRollup(createProviderPair(config), config);
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: true,
    procLog: true,
  });
  afterAll(() => foundry.shutdown());
  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, {
    protocol: 'raw',
    log: false,
  });
  afterAll(() => ccip.http.close());
  const verifier = await foundry.deploy({
    file: 'LineaVerifier',
    args: [],
    libs: {
      SparseMerkleProof: config.SparseMerkleProof,
    },
  });

  //[ccip.endpoint], rollup.defaultWindow, rollup.L1MessageService

  const gatewayUrlsBytes = ABI_CODER.encode(['string[]'], [[ccip.endpoint]]);
  const windowBytes = ABI_CODER.encode(['uint256'], [rollup.defaultWindow]);
  const rollupAddressBytes = ABI_CODER.encode(
    ['address'],
    [rollup.L1MessageService.target]
  );

  const theArgs = [
    verifier.target,
    (await foundry.ensureWallet('admin')).address,
    '0x',
    gatewayUrlsBytes,
    windowBytes,
    rollupAddressBytes,
  ];

  console.log('args', theArgs);

  const proxy = await foundry.deploy({
    file: 'VerifierProxy',
    args: theArgs,
  });

  // https://lineascan.build/address/0x48F5931C5Dbc2cD9218ba085ce87740157326F59#code
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [proxy.target, '0x48F5931C5Dbc2cD9218ba085ce87740157326F59'],
  });
  runSlotDataTests(reader);
});
