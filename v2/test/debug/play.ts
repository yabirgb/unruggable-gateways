import { EVMRequestV1 } from '../../src/v1.js';
import { EVMProver, EVMRequest } from '../../src/vm.js';
//import {Foundry} from '@adraffy/blocksmith';
//import {ethers} from 'ethers';
import { createProvider } from '../providers.js';

// this is just a worksheet

//let foundry = await Foundry.launch({infoLog: false});

const prover = await EVMProver.latest(createProvider(1));

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

// #0: mapping (bytes32 => Record) records; => struct Record { address owner; address resolver;	uint64 ttl; }
// #1: mapping (address => mapping(address => bool)) operators;
// #2: ENS _old

{
  const r = new EVMRequest(1);
  r.push(ENS_REGISTRY).target();
  r.push(0).follow().read().setOutput(0); // owner of root: 0xaB528d626EC275E3faD363fF1393A41F581c5897
  const vm = await prover.evalRequest(r);
  console.log(await vm.resolveOutputs());
}

//console.log(await prover.execute(new EVMRequest(0).setTarget(ENS_REGISTRY).element(0).getValue()));

//console.log(await prover.execute(new EVMRequest().setTarget('0xE68d1aEeE2C17E43A955103DaB5E341eE439f55c').getValues(10)));

prover.provider.destroy();
//await foundry.shutdown();

const A = ENS_REGISTRY;
const r1 = new EVMRequestV1(A).getStatic(3).getStatic(4).ref(0);
const r2 = new EVMRequest()
  .setTarget(A)
  .setSlot(3)
  .read()
  .addOutput()
  .setSlot(4)
  .pushOutput(0)
  .follow()
  .read()
  .addOutput();

console.log(r1.v2());
console.log(r2);
