import {EVMProver, EVMRequest, MAX_READ_BYTES, MAX_UNIQUE_TARGETS, MAX_UNIQUE_PROOFS, MAX_STACK} from '../../src/vm.js';
import {Foundry} from '@adraffy/blocksmith';
import {ethers} from 'ethers';
import {afterAll, test, expect, describe} from 'bun:test';

describe('limits', async () => {

	let foundry = await Foundry.launch({infoLog: false});
	afterAll(() => foundry.shutdown());
	let contract = await foundry.deploy({sol: `
		contract X {
			uint256[] array = [${Array.from({length: 512}, (_, i) => i)}];
		}
	`});
	let prover = await EVMProver.latest(foundry.provider);
	async function exec(r: EVMRequest) {
		let state = await prover.evalRequest(r);
		return prover.prove(state.needs);
	}
	//afterAll(async () => console.log(await prover.cachedMap()));
	
	test('max stack', async () => {
		let r = new EVMRequest();
		for (let i = 0; i < MAX_STACK; i++) {
			r.push(0);
		}
		expect(exec(r)).resolves.toBeDefined();
		r.push(0); // one more
		expect(exec(r)).rejects.toThrow('stack overflow');
	});

	test('max targets', async () => {
		let r = new EVMRequest();
		for (let i = 0; i < MAX_UNIQUE_TARGETS; i++) {
			r.setTarget(ethers.toBeHex(i, 20));
		}
		expect(exec(r)).resolves.toBeDefined();
		r.setTarget('0x51050ec063d393217B436747617aD1C2285Aeeee'); // one more
		expect(exec(r)).rejects.toThrow('too many targets');
	});

	test('max bytes', async () => {
		let slots = MAX_READ_BYTES >> 5;
		expect(slots).toBeLessThan(255); // since +1
		expect(exec(new EVMRequest().read(slots))).resolves.toBeDefined();
		expect(exec(new EVMRequest().read(slots + 1))).rejects.toThrow(/^too many bytes:/);
	});

	test('max proofs', async () => {
		let r = new EVMRequest();
		r.setTarget(contract.target);
		for (let i = 1; i < MAX_UNIQUE_PROOFS; i++) { // 1 less
			r.setSlot(i).read().pop();
		}
		expect(exec(r)).resolves.toBeDefined();
		r.setSlot(0).read(); // one more
		expect(exec(r)).rejects.toThrow(/^too many proofs:/);
	});

});
