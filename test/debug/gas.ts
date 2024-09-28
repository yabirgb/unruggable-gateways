
import { GatewayRequest, } from '../../src/vm.js';
import { EthProver } from '../../src/eth/EthProver.js';
import { Foundry } from '@adraffy/blocksmith';
import { toPaddedHex } from '../../src/utils.js';
import * as assert from 'node:assert/strict';
import { hexlify, keccak256, randomBytes } from 'ethers';

function rngUint(n = 32) {
	return BigInt(hexlify(randomBytes(n)));
  }
  
const foundry = await Foundry.launch({ infoLog: true });
try {
	const verifier = await foundry.deploy({
		file: 'EthSelfVerifier',
	});

	async function verify(req: GatewayRequest) {
		const prover = await EthProver.latest(foundry.provider);
		const stateRoot = await prover.fetchStateRoot();
		const state = await prover.evalRequest(req);
		const [proofSeq, values] = await Promise.all([
			prover.prove(state.needs),
			state.resolveOutputs(),
		]);
		const args = [req.toTuple(), stateRoot, proofSeq.proofs, proofSeq.order];
		const res = await verifier.verify(...args);
		assert.deepEqual(values, res.outputs.toArray());
		assert.equal(res.exitCode, BigInt(state.exitCode));
		return { values, ...state };
	}

	const req = new GatewayRequest();
	req.debug();
	req.push(0);
	let sum = 0n;
	const n = 4000;
	for (let i = 0; i < n; i++) {
		//req.push(1).plus();
		const x = rngUint();
		req.push(x).plus();
		sum += x;
		req.keccak();
		sum = BigInt(keccak256(toPaddedHex(sum)));
		//req.keccak();
	}
	req.addOutput();
	req.debug();
	const state = await verify(req);
	assert.equal(state.values[0],  toPaddedHex(sum));

} finally {
	await foundry.shutdown();
}
