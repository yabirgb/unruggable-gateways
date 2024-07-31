import { OPFaultGateway } from '../../src/gateway/OPFaultGateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import {
  createProvider,
  providerURL,
  CHAIN_SEPOLIA,
  CHAIN_BASE_TESTNET,
} from '../providers.js';
import { runSlotDataTests, LOG_CCIP } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('base testnet', async () => {
  const foundry = await Foundry.launch({
    fork: providerURL(CHAIN_SEPOLIA),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const gateway = OPFaultGateway.baseTestnet({
    provider1: foundry.provider,
    provider2: createProvider(CHAIN_BASE_TESTNET),
  });
  const ccip = await serve(gateway, {
    protocol: 'raw',
    port: 0,
    log: LOG_CCIP,
  });
  afterAll(() => ccip.http.close());
  const verifier = await foundry.deploy({
    file: 'OPFaultVerifier',
    args: [[ccip.endpoint], gateway.OptimismPortal, gateway.blockDelay],
  });
  // https://sepolia.basescan.org/address/0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411'],
  });
  runSlotDataTests(reader);
});
