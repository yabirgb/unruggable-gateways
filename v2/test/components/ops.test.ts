import type {BigNumberish} from '../../src/types.js';
import {EVMRequest, EVMProver} from '../../src/vm.js';
import {Foundry} from '@adraffy/blocksmith';
import {ethers} from 'ethers';
import {test, afterAll, expect, describe} from 'bun:test';

function hexStr(s: string) {
	return ethers.hexlify(ethers.toUtf8Bytes(s));
}
function uint256(x: BigNumberish) {
	return ethers.toBeHex(x, 32);
}

describe('ops', async () => {

	let foundry = await Foundry.launch({infoLog: false});
	afterAll(() => foundry.shutdown());
	let verifier = await foundry.deploy({file: 'SelfVerifier', args: [ethers.ZeroAddress]});
	let contract = await foundry.deploy({sol: `
		contract X {
			uint256 value1 = 1;
			uint256 value2 = 2;
			string small = "abc";
			string big = "${'abc'.repeat(20)}";
			uint96[] array = [1, 2, 3];
		}
	`});
	
	async function verify(req: EVMRequest) {
		let prover = await EVMProver.latest(foundry.provider);
		let stateRoot = await prover.fetchStateRoot();
		let vm = await prover.evalRequest(req);
		let {proofs, order} = await prover.prove(vm.needs);
		let values = await vm.resolveOutputs();
		let res = await verifier.verifyMerkle([Uint8Array.from(req.ops), req.inputs], stateRoot, proofs, order);
		expect(res.outputs.toArray()).toEqual(values);
		expect(res.exitCode).toBe(BigInt(vm.exitCode));
		return {values, ...vm};
	}

	test('setOutput', async () => {
		let req = new EVMRequest(1);
		req.push(1).setOutput(0);
		let {values} = await verify(req);
		expect(values[0]).toBe(uint256(1));
	});

	test('addOutput', async () => {
		let req = new EVMRequest(0);
		req.push(1).addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(uint256(1));
	});

	test('setOutput overflow', async () => {
		let req = new EVMRequest();
		req.push(1).setOutput(0);
		expect(verify(req)).rejects.toThrow(/invalid output index: \d+/);
	});

	test('keccak', async () => {
		let req = new EVMRequest();
		req.pushStr('').keccak().addOutput();
		req.pushStr('chonk').keccak().addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(ethers.id(''));
		expect(values[1]).toBe(ethers.id('chonk'));
	});

	test('slice', async () => {
		let small = '0x112233445566778899';
		let big = Uint8Array.from({length: 500}, (_, i) => i);
		let req = new EVMRequest();
		req.pushBytes(small).slice(4, 3).addOutput();
		req.pushBytes(big).slice(300, 5).addOutput();
		req.pushBytes('0x').slice(0, 0).addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(ethers.dataSlice(small, 4, 4 + 3));
		expect(values[1]).toBe(ethers.hexlify(big.slice(300, 300 + 5)));
		expect(values[2]).toBe('0x');
	});

	test('slice overflow', async () => {
		let req = new EVMRequest();
		req.pushBytes('0x1234').slice(5, 1);
		expect(verify(req)).rejects.toThrow('slice overflow');
	});

	test('concat ints', async () => {
		let req = new EVMRequest();
		req.push(1).push(2).concat(2).addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(ethers.concat([uint256(1), uint256(2)]));
	});

	test('concat string x2', async () => {
		let req = new EVMRequest();
		req.pushStr('r').pushStr('af').pushStr('fy').concat(2).concat(2).addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(hexStr('raffy'));
	});

	test('concat empty', async () => {
		let req = new EVMRequest();
		req.concat(255).addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe('0x');
	});
	
	test('dup last', async () => {
		let req = new EVMRequest();
		req.push(1).dup().addOutput().addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(uint256(1));
		expect(values[1]).toBe(uint256(1));
	});

	test('dup deep', async () => {
		let req = new EVMRequest();
		req.push(1).push(2).push(3).dup(2).addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(uint256(1));
	});

	test('dup nothing', async () => {
		let req = new EVMRequest();
		req.dup().addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe('0x');
	});

	test('pop', async () => {
		let req = new EVMRequest();
		req.push(1).push(2).pop().addOutput();
		let {values} = await verify(req);
		expect(values.length).toBe(1);
		expect(values[0]).toBe(uint256(1));
	});

	test('pop underflow is allowed', async () => {
		let req = new EVMRequest();
		req.pop().pop().pop();
		expect(verify(req)).resolves;
		//expect(verify(req)).rejects.toThrow('stack underflow');
	});

	test('pushSlot', async () => {
		let req = new EVMRequest();
		req.setSlot(1337).pushSlot().addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(uint256(1337));
	});

	test('pushTarget', async () => {
		let req = new EVMRequest();
		req.setTarget(contract.target).pushTarget().addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(contract.target.toLowerCase());
	});

	test('pushOutput', async () => {
		let req = new EVMRequest(2);
		req.push(5).setOutput(0).pushOutput(0).setOutput(1);
		let {values} = await verify(req);
		expect(values[1]).toBe(uint256(5));
	});

	test('follow', async () => {
		let req = new EVMRequest();
		req.setSlot(1337).pushStr('raffy').follow().pushSlot().addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(ethers.keccak256(ethers.concat([hexStr('raffy'), uint256(1337)])));
	});

	test('read', async () => {
		let req = new EVMRequest();
		req.setTarget(contract.target)
			.setSlot(0).read().addOutput()
			.setSlot(1).read().addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(uint256(1));
		expect(values[1]).toBe(uint256(2));
	});

	test('read no target', async () => {
		let req = new EVMRequest();
		req.read().addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(uint256(0));
	});

	test('read(0)', async () => {
		let req = new EVMRequest();
		req.read(0).addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe('0x');
	});

	test('read(2)', async () => {
		let req = new EVMRequest();
		req.setTarget(contract.target).setSlot(0).read(2).addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(ethers.concat([uint256(1), uint256(2)]));
	});

	test('readBytes small', async () => {
		let req = new EVMRequest();
		req.setTarget(contract.target).setSlot(2).readBytes().addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(hexStr('abc'));
	});

	test('readBytes big', async () => {
		let req = new EVMRequest();
		req.setTarget(contract.target).setSlot(3).readBytes().addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe(hexStr('abc'.repeat(20)));
	});

	test('readArray', async () => {
		let req = new EVMRequest();
		req.setTarget(contract.target).setSlot(4).readArray(96 >> 3).addOutput();
		let {values} = await verify(req);
		expect(values[0]).toBe('0x000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000020000000000000000000000010000000000000000000000000000000000000000000000000000000000000003');
	});

	test('requireNonzero on zero', async () => {
		let req = new EVMRequest();
		req.push(0).requireNonzero();
		let {exitCode} = await verify(req);
		expect(exitCode).toBe(1);
	});

	test('requireNonzero on non-zero', async () => {
		let req = new EVMRequest();
		req.push(1).requireNonzero();
		req.push('0x0001').requireNonzero();
		req.pushStr('abc').requireNonzero();
		let {exitCode} = await verify(req);
		expect(exitCode).toBe(0);
	});

	test('requireContract on contract', async () => {
		let req = new EVMRequest();
		req.setTarget(contract.target).requireContract();
		let {exitCode} = await verify(req);
		expect(exitCode).toBe(0);
	});

	test('requireContract on null', async () => {
		let req = new EVMRequest();
		req.setTarget(ethers.ZeroAddress).requireContract();
		let {exitCode} = await verify(req);
		expect(exitCode).toBe(1);
	});

	test('eval requireContract', async () => {
		let req = new EVMRequest();
		req.push(1);
		req.push(contract.target);
		req.push('0x51050ec063d393217B436747617aD1C2285Aeeee');
		req.push(uint256(0));
		req.begin().target().requireContract().end();
		req.eval({success: true, acquire: true});
		let {target, stack} = await verify(req);
		expect(target).toBe(contract.target.toLowerCase());
		expect(stack).toHaveLength(0);
	});

	test('eval requireNonzero', async () => {
		let req = new EVMRequest(1);
		req.push(123);
		req.push(1337);
		req.push(0);
		req.pushStr('');
		req.begin().requireNonzero().setOutput(0).end();
		req.eval({success: true});
		let {values, stack} = await verify(req);
		expect(values[0]).toBe(uint256(1337));
		expect(stack).toHaveLength(0);
	});

});



