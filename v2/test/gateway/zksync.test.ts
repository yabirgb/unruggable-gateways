import { ZKSyncGateway } from '../../src/zksync/gateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import {
  createProvider,
  providerURL,
  CHAIN_ZKSYNC,
  CHAIN_MAINNET,
} from '../providers.js';
import { runSlotDataTests, LOG_CCIP } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('zksync', async () => {
  const foundry = await Foundry.launch({
    fork: providerURL(CHAIN_MAINNET),
    infoLog: true,
    procLog: true,
    infiniteCallGas: 1,
  });
  afterAll(() => foundry.shutdown());
  const gateway = new ZKSyncGateway({
    provider1: foundry.provider,
    provider2: createProvider(CHAIN_ZKSYNC),
    ...ZKSyncGateway.mainnetConfig(),
  });
  const ccip = await serve(gateway, {
    protocol: 'raw',
    port: 0,
    log: LOG_CCIP,
  });
  afterAll(() => ccip.http.close());
  const smt = await foundry.deploy({
    file: 'ZKSyncSMT',
  });
  const verifier = await foundry.deploy({
    file: 'ZKSyncVerifier',
    args: [[ccip.endpoint], gateway.DiamondProxy, smt, 1],
  });
  // https://explorer.zksync.io/address/0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc#contract
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc'],
  });
  runSlotDataTests(reader, true);
});
