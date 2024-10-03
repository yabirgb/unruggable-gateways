import { OPRollup } from '../../src/op/OPRollup.js';
import { testOP } from './common.js';

testOP(OPRollup.celoAlfajoresConfig, {
  // https://alfajores.celoscan.io/address/0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6#code
  slotDataContract: '0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6',
  skipCI: true,
});
