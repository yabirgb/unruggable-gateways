import {EVMProver, EVMRequest} from '../../../src/vm.js';
import {CHAIN_BASE, createProvider} from '../../../src/providers.js';
import {ethers} from 'ethers';

let prover = await EVMProver.latest(createProvider(CHAIN_BASE));

let req = new EVMRequest(3).setTarget('0x7C6EfCb602BC88794390A0d74c75ad2f1249A17f');
req.setSlot(8).read().setOutput(0);
req.setSlot(7).pushStr("raffy").keccak().follow().read().setOutput(1);
req.offset(1).readBytes().setOutput(2);

let state = await prover.evalRequest(req);

console.log(state);

let values = await state.resolveOutputs();

console.log({
	supply: ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], values[0])[0],
	address: ethers.AbiCoder.defaultAbiCoder().decode(['address'], values[1])[0],
	avatar: ethers.toUtf8String(values[2]),
});

