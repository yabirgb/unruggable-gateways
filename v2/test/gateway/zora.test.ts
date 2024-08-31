import { OPRollup } from '../../src/op/OPRollup.js';
import { testOP } from './common.js';

if (!process.env.IS_CI) {
  testOP(
    OPRollup.zoraMainnetConfig,
    // https://explorer.zora.energy/address/0x73404681064a8e16c22C1411A02D47e6395f6582
    '0x73404681064a8e16c22C1411A02D47e6395f6582'
  );
}
