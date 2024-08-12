import { OPFaultGateway } from '../../src/op/OPFaultGateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { createProviderPair, providerURL } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('base testnet', async () => {
  const config = OPFaultGateway.baseTestnetConfig;
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const gateway = new OPFaultGateway({
    ...createProviderPair(config),
    ...config,
  });
  const ccip = await serve(gateway, {
    protocol: 'raw',
    port: 0,
    log: false,
  });
  afterAll(() => ccip.http.close());
  const helper = await foundry.deploy({
    file: 'OPFaultConstantHelper',
    args: [await gateway.getLatestCommitIndex()],
  });
  const verifier = await foundry.deploy({
    file: 'OPFaultVerifier',
    args: [
      [ccip.endpoint],
      gateway.supportedWindow,
      gateway.OptimismPortal,
      helper,
    ],
  });
  // https://sepolia.basescan.org/address/0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411'],
  });
  runSlotDataTests(reader);
});
