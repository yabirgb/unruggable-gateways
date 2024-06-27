import type {BigNumberish, HexString} from '../../src/types.js';
import {EVMRequest, EVMProver} from '../../src/vm.js';
import {Foundry} from '@adraffy/blocksmith';
import {ethers} from 'ethers';


let foundry = await Foundry.launch({infoLog: false, procLog: true});
let verifier = await foundry.deploy({file: 'SelfVerifier', args: [ethers.ZeroAddress]});
let contract = await foundry.deploy({sol: `
	contract X {
		uint256 value1 = 1;
		uint256 value2 = 2;
		string small = "abc";
		string big = "${'abc'.repeat(20)}";
		uint16[] array = [1, 2];
	}
`});

async function verify(req: EVMRequest) {
	let prover = await EVMProver.latest(foundry.provider);
	let stateRoot = await prover.fetchStateRoot();
	let vm = await prover.evalRequest(req);
	let {proofs, order} = await prover.prove(vm.needs);
	let expected = await vm.resolveOutputs();
	let res = await verifier.verifyMerkle([Uint8Array.from(req.ops), req.inputs], stateRoot, proofs, order);
	let outputs = res.outputs.toArray() as HexString[];
	let exitCode = Number(res.exitCode);
	return {outputs, expected, exitCode};
}

let req = new EVMRequest();
req.setTarget(contract.target).setSlot(4).readArray(2).addOutput();
let {outputs} = await verify(req);
console.log(outputs);


foundry.shutdown();
