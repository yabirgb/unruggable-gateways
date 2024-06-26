import {EVMRequest, EVMProver} from '../../src/vm.js';
import {Foundry} from '@adraffy/blocksmith';
import assert from 'node:assert/strict';
import {test, afterAll} from 'bun:test';

test('FOLLOW === PUSH_SLOT CONCAT(2) KECCAK SLOT_ZERO SLOT_ADD', async () => {

	let foundry = await Foundry.launch({infoLog: false});
	afterAll(() => foundry.shutdown());

	let contract = await foundry.deploy({sol: `
		contract X {
			mapping (uint256 => uint256) map;
			constructor() {
				map[1] = 2;
			}
		}
	`});

	let prover = await EVMProver.latest(foundry.provider);
	
	let r1 = new EVMRequest().setTarget(contract.target).push(1).follow().read().addOutput();
	let r2 = new EVMRequest().setTarget(contract.target).push(1).pushSlot().concat(2).keccak().zeroSlot().addSlot().read().addOutput();

	assert.notDeepEqual(r1.ops, r2.ops);
	assert.deepEqual(
		await prover.evalRequest(r1).then(x => x.resolveOutputs()), 
		await prover.evalRequest(r2).then(x => x.resolveOutputs())
	);

});
