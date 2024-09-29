import { OPRollup } from '../../src/op/OPRollup.js';
import { testOP } from './common.js';

testOP(OPRollup.zoraMainnetConfig, {
  // https://explorer.zora.energy/address/0x73404681064a8e16c22C1411A02D47e6395f6582
  slotDataContract: '0x73404681064a8e16c22C1411A02D47e6395f6582',
  skipCI: true,
});
