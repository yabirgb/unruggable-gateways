import { Foundry } from '@adraffy/blocksmith';
import { CHAINS } from '../../src/chains.js';
import { EthProver, encodeProof } from '../../src/eth/EthProver.js';
import { createProvider, providerURL } from '../providers.js';
import { ZeroAddress } from 'ethers/constants';

const provider = createProvider(CHAINS.SCROLL);

const prover = await EthProver.latest(provider);

const target = '0x28507d851729c12F193019c7b05D916D53e9Cf57';
const proof = await prover.getProofs(target, [0n]);
const storageProof = proof.storageProof[0];
const stateRoot = await prover.fetchStateRoot();

console.log({
	target,
	storageProof,
	stateRoot
});

const foundry = await Foundry.launch({
	fork: providerURL(CHAINS.MAINNET)
});

const verifier = await foundry.deploy({
	file: 'ScrollSelfVerifier',
	args: ['0x3508174Fa966e75f70B15348209E33BC711AE63e']
});

console.log(proof.accountProof.length);

try {
	const storageRoot = await verifier.proveAccountState(stateRoot, target, encodeProof(proof.accountProof));
	console.log({storageRoot});
	const storageValue = await verifier.proveStorageValue(storageRoot, ZeroAddress, storageProof.key, encodeProof(storageProof.proof));
	console.log({storageValue});
} catch (err) {
	console.log(err);
}

await foundry.shutdown();

