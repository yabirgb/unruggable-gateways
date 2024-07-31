import { FinalizedOPFaultGateway } from '../../src/gateway/OPFaultGateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { createProvider, providerURL, CHAIN_OP } from '../providers.js';
import { runSlotDataTests, LOG_CCIP } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('finalized op', async () => {
  const foundry = await Foundry.launch({
    fork: providerURL(1),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const gateway = FinalizedOPFaultGateway.mainnet({
    provider1: foundry.provider,
    provider2: createProvider(CHAIN_OP),
  });
  const ccip = await serve(gateway, {
    protocol: 'raw',
    port: 0,
    log: LOG_CCIP,
  });
  afterAll(() => ccip.http.close());
  const verifier = await foundry.deploy({
    file: 'FinalizedOPFaultVerifier',
    args: [[ccip.endpoint], gateway.OptimismPortal, gateway.blockDelay],
  });
  // https://optimistic.etherscan.io/address/0xf9d79d8c09d24e0C47E32778c830C545e78512CF
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0xf9d79d8c09d24e0C47E32778c830C545e78512CF'],
  });
  runSlotDataTests(reader);
});
