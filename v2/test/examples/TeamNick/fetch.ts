import { EVMProver, EVMRequest } from '../../../src/vm.js';
import { CHAIN_BASE, createProvider } from '../../providers.js';
import { AbiCoder, toUtf8String } from 'ethers';

const coder = AbiCoder.defaultAbiCoder();
const prover = await EVMProver.latest(createProvider(CHAIN_BASE));

//https://basescan.org/address/0x7C6EfCb602BC88794390A0d74c75ad2f1249A17f#code
const req = new EVMRequest(3).setTarget(
  '0x7C6EfCb602BC88794390A0d74c75ad2f1249A17f'
);
req.setSlot(8).read().setOutput(0);
req.setSlot(7).pushStr('raffy').keccak().follow().read().setOutput(1);
req.offset(1).readBytes().setOutput(2);

const state = await prover.evalRequest(req);

console.log(state);

const values = await state.resolveOutputs();

console.log({
  supply: coder.decode(['uint256'], values[0])[0],
  address: coder.decode(['address'], values[1])[0],
  avatar: toUtf8String(values[2]),
});
