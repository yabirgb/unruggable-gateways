import { ScrollRollup } from '../../src/scroll/ScrollRollup.js';
import { testScroll } from './common.js';

testScroll(ScrollRollup.testnetConfig, {
  // https://sepolia.scrollscan.com/address/0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05#code
  slotDataContract: '0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05',
  skipCI: true,
});
