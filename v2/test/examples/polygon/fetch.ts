import { EVMProver, EVMRequest } from '../../../src/vm.js';
import { CHAIN_POLYGON, createProvider } from '../../../src/providers.js';
import { AbiCoder } from 'ethers';

const coder = AbiCoder.defaultAbiCoder();
const prover = await EVMProver.latest(createProvider(CHAIN_POLYGON));

//https://polygonscan.com/address/0xc695404735e0f1587a5398a06cab34d7d7b009da#code
const SLOT_DATA_CONTRACT_ADDRESS = '0xc695404735e0f1587a5398a06cab34d7d7b009da';

const req = new EVMRequest(1).setTarget(SLOT_DATA_CONTRACT_ADDRESS);

req.setSlot(0).read().setOutput(0);

const state = await prover.evalRequest(req);

console.log(state);

const values = await state.resolveOutputs();

console.log({
  supply: coder.decode(['uint256'], values[0])[0],
});
