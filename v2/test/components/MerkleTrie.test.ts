import type {HexString, BigNumberish} from '../../src/types.js';
import {EVMProver} from '../../src/vm.js';
import {proveAccountState, proveStorageValue, NULL_TRIE_HASH} from '../../src/merkle.js';
import {Foundry} from '@adraffy/blocksmith';
import {ethers} from 'ethers';
import {afterAll, test, expect} from 'bun:test';

async function setup() {
	let foundry = await Foundry.launch({infoLog: false});
	afterAll(() => foundry.shutdown());
	await foundry.nextBlock(); // force mine a block
	return {
		foundry,
		async prover() {
			let prover = await EVMProver.latest(foundry.provider);
			let stateRoot = await prover.fetchStateRoot();
			return {
				async assertDoesNotExist(target: HexString) {
					let {accountProof} = await prover.getProofs(target);
					let accountState = proveAccountState(target, accountProof, stateRoot);
					expect(accountState).toBeUndefined();
				},
				async assertValue(target: HexString, slot: BigNumberish, expected: BigNumberish) {
					slot = ethers.getUint(slot);
					let {accountProof, storageHash, storageProof: [{value, proof}]} =  await prover.getProofs(target, [slot]);
					let accountState = proveAccountState(target, accountProof, stateRoot);
					expect(accountState?.storageRoot).toBe(storageHash);
					let slotValue = proveStorageValue(slot, proof, storageHash);
					expect(slotValue).toBe(ethers.toBeHex(value, 32));
					expect(slotValue).toBe(ethers.toBeHex(expected, 32));
					let liveValue = await prover.provider.getStorage(target, slot);
					return {
						nullRoot: storageHash === NULL_TRIE_HASH, 
						liveValue,
						slotValue,
						same: liveValue === slotValue,
					};
				}
			}
		}
	}
}

test(`nonexistent EOAs don't exist`, async () => {
	let T = await setup();
	let P = await T.prover();
	for (let i = 0; i < 5; i++) {
		await P.assertDoesNotExist(ethers.toBeHex(1, 20));
	}
});

test('EOA with balance exists', async () => {
	let T = await setup();
	let P = await T.prover();
	let V = await P.assertValue(T.foundry.wallets.admin.address, 0, 0);
	expect(V.nullRoot).toBeTrue();
});

test('empty contract', async () => {
	let T = await setup();
	let C = await T.foundry.deploy({sol: `contract C {}`});
	let P = await T.prover();
	await P.assertValue(C.target, 0, 0);
});

test('slotless contract', async () => {
	let T = await setup();
	let C = await T.foundry.deploy({sol: `
		contract C {
			function set(uint256 slot, uint256 value) external {
				assembly { sstore(slot, value) }
			}
		}
	`});
	let P1 = await T.prover();
	await P1.assertValue(C.target, 0, 0); // unset
	await T.foundry.confirm(C.set(0, 1)); // make change
	await P1.assertValue(C.target, 0, 0); // not visible to prover
	let P2 = await T.prover();            // new prover
	await P2.assertValue(C.target, 0, 1); // visible
});

test('slotted contract', async () => {
	let T = await setup();
	let C = await T.foundry.deploy({sol: `
		contract C {
			uint256 slot0 = 0;
			uint256 slot1 = 1;
			function set(uint256 slot, uint256 value) external {
				assembly { sstore(slot, value) }
			}
		}
	`});
	let P1 = await T.prover();
	await P1.assertValue(C.target, 0, 0); // init
	await P1.assertValue(C.target, 1, 1); // init
	await P1.assertValue(C.target, 2, 0); // unset
	
	await T.foundry.confirm(C.set(0, 1)); // change slot 0
	await T.foundry.confirm(C.set(2, 1)); // change slot 2

	expect(P1.assertValue(C.target, 0, 0).then(x => x.same), 'expected slot(0) is diff').resolves.toBeFalse();
	expect(P1.assertValue(C.target, 1, 1).then(x => x.same), 'expected slot(1) is same').resolves.toBeTrue();
	expect(P1.assertValue(C.target, 2, 0).then(x => x.same), 'expected slot(2) is diff').resolves.toBeFalse();

	let P2 = await T.prover();
	await P2.assertValue(C.target, 0, 1); // new value
	await P2.assertValue(C.target, 2, 1); // new value
});


