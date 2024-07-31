
import { EVMProver, EVMRequest } from '../../src/vm.js';
//import {Foundry} from '@adraffy/blocksmith';
//import {ethers} from 'ethers';
import { CHAIN_BASE_TESTNET, createProvider } from '../providers.js';

// this is just a worksheet

//let foundry = await Foundry.launch({infoLog: false});

const prover = await EVMProver.latest(createProvider(CHAIN_BASE_TESTNET));

const req = new EVMRequest().setTarget('0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411');
req.setSlot(0).read().addOutput();

const vm = await prover.evalRequest(req);
console.log(vm);
console.log(await vm.resolveOutputs());

