import { NitroRollup } from '../../src/nitro/NitroRollup.js';
import { testDoubleNitro } from './common.js';

testDoubleNitro(
  { ...NitroRollup.arb1MainnetConfig, minAgeBlocks: 1 },
  { ...NitroRollup.apeMainnetConfig, minAgeBlocks: 1 },
  {
    // https://apescan.io/address/0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6#code
    slotDataContract: '0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6',
    skipCI: true,
  }
);
