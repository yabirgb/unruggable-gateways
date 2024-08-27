import { EVMRequest } from '../../../src/vm.js';
import { EthProver } from '../../../src/eth/EthProver.js';
import { createProvider } from '../../providers.js';
import { CHAIN_BASE } from '../../../src/chains.js';
import { ABI_CODER } from '../../../src/utils.js';
import { ethers } from 'ethers';

const prover = await EthProver.latest(createProvider(CHAIN_BASE));

//https://basescan.org/address/0x7C6EfCb602BC88794390A0d74c75ad2f1249A17f#code
const req = new EVMRequest(3)
  .setTarget('0x7C6EfCb602BC88794390A0d74c75ad2f1249A17f')
  .setSlot(8)
  .read()
  .setOutput(0)
  .setSlot(7)
  .pushStr('raffy')
  .keccak()
  .follow()
  .read()
  .setOutput(1)
  .offset(1)
  .readBytes()
  .setOutput(2);

const state = await prover.evalRequest(req);

console.log(state.needs);

const values = await state.resolveOutputs();

console.log({
  supply: ABI_CODER.decode(['uint256'], values[0])[0],
  address: ABI_CODER.decode(['address'], values[1])[0],
  avatar: ethers.toUtf8String(values[2]),
});
