import type {HexString} from '../../src/types.js';
import {EVMRequest, EVMProver} from '../../src/vm.js';
import {Foundry} from '@adraffy/blocksmith';
import {ethers} from 'ethers';
import {test, afterAll, expect, describe} from 'bun:test';

describe('ops', async () => {

	let foundry = await Foundry.launch({infoLog: false});
	afterAll(() => foundry.shutdown());
	let verifier = await foundry.deploy({file: 'SelfVerifier', args: [ethers.ZeroAddress]});
	
	async function verify(req: EVMRequest) {
		let prover = await EVMProver.latest(foundry.provider);
		let stateRoot = await prover.getStateRoot();
		let state = await prover.evalRequest(req);
		let {proofs, order} = await prover.prove(state.needs);
		let expected = await state.resolveOutputs();
		let res = await verifier.verifyMerkle([Uint8Array.from(req.ops), req.inputs], stateRoot, proofs, order);
		let outputs = res.outputs.toArray() as HexString[];
		let exitCode = Number(res.exitCode);
		expect(outputs).toEqual(expected);
		expect(exitCode).toBe(state.exitCode);
		return {outputs, exitCode};
	}

	test('keccak', async () => {
		let req = new EVMRequest();
		req.pushStr('').keccak().addOutput();
		req.pushStr('chonk').keccak().addOutput();
		let {outputs} = await verify(req);
		expect(outputs[0]).toBe(ethers.id(''));
		expect(outputs[1]).toBe(ethers.id('chonk'));
	});

	test('slice', async () => {
		let small = '0x112233445566778899';
		let big = Uint8Array.from({length: 500}, (_, i) => i);
		let req = new EVMRequest();
		req.pushBytes(small).slice(4, 3).addOutput();
		req.pushBytes(big).slice(300, 5).addOutput();
		req.pushBytes('0x').slice(0, 0).addOutput();
		let {outputs} = await verify(req);
		expect(outputs[0]).toBe(ethers.dataSlice(small, 4, 4 + 3));
		expect(outputs[1]).toBe(ethers.hexlify(big.slice(300, 300 + 5)));
		expect(outputs[2]).toBe('0x');
	});

	test('slice overflow', async () => {
		let req = new EVMRequest();
		req.pushBytes('0x1234').slice(5, 1);
		expect(verify(req)).rejects.toThrow('slice overflow');
	});

	test('concat', async () => {
		let req = new EVMRequest();
		req.push(1).push(2).concat(2).addOutput();
		req.pushStr('r').pushStr('af').pushStr('fy').concat(2).concat(2).addOutput();
		let {outputs} = await verify(req);
		expect(outputs[0]).toBe(ethers.concat([ethers.toBeHex(1, 32), ethers.toBeHex(2, 32)]));
		expect(outputs[1]).toBe(ethers.hexlify(ethers.toUtf8Bytes('raffy')));
	});

	test('dup', async () => {
		let req = new EVMRequest();
		req.push(1).dup().addOutput().addOutput();
		let {outputs} = await verify(req);
		expect(outputs[0]).toBe(ethers.toBeHex(1, 32));
		expect(outputs[1]).toBe(ethers.toBeHex(1, 32));
	});

	test('dup nothing', async () => {
		let req = new EVMRequest();
		req.dup();
		expect(verify(req)).rejects.toThrow('stack overflow');
	});

	test('pop', async () => {
		let req = new EVMRequest();
		req.push(1).push(2).pop().addOutput();
		let {outputs} = await verify(req);
		expect(outputs.length).toBe(1);
		expect(outputs[0]).toBe(ethers.toBeHex(1, 32));
	});

	test('pop underflow', async () => {
		let req = new EVMRequest();
		req.pop().pop().pop();
		expect(verify(req)).rejects.toThrow('stack underflow');
	});

	test('pushSlot', async () => {
		let req = new EVMRequest();
		req.setSlot(1337).pushSlot().addOutput();
		let {outputs} = await verify(req);
		expect(outputs[0]).toBe(ethers.toBeHex(1337, 32));
	});

	test('follow', async () => {
		let req = new EVMRequest();
		req.setSlot(1337).pushStr('raffy').follow().pushSlot().addOutput();
		let {outputs} = await verify(req);
		expect(outputs[0]).toBe(ethers.keccak256(ethers.concat([ethers.toUtf8Bytes('raffy'), ethers.toBeHex(1337, 32)])));
	});

});



