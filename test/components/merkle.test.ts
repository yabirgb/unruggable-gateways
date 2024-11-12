import type { BigNumberish, HexAddress } from '../../src/types.js';
import { EthProver } from '../../src/eth/EthProver.js';
import {
  verifyAccountState,
  verifyStorageValue,
} from '../../src/eth/merkle.js';
import { Foundry } from '@adraffy/blocksmith';
import { describe, afterAll, test, expect } from 'bun:test';
import { toPaddedHex } from '../../src/utils.js';

async function setup() {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(foundry.shutdown);
  await foundry.nextBlock();
  return {
    foundry,
    async prover() {
      const prover = await EthProver.latest(foundry.provider);
      const stateRoot = await prover.fetchStateRoot();
      return {
        async assertAccount(target: HexAddress, exists: boolean) {
          const { accountProof } = await prover.getProofs(target);
          const accountState = verifyAccountState(
            target,
            accountProof,
            stateRoot
          );
          expect(accountState !== undefined, 'accountState').toEqual(exists);
        },
        async assertValue(target: HexAddress, slot: BigNumberish) {
          slot = BigInt(slot);
          const {
            accountProof,
            storageHash,
            storageProof: [{ value, proof }],
          } = await prover.getProofs(target, [slot]);
          const accountState = verifyAccountState(
            target,
            accountProof,
            stateRoot
          );
          expect(accountState, 'accountState').toBeDefined();
          expect(accountState!.storageRoot, 'storageRoot').toEqual(storageHash);
          const storageValue = verifyStorageValue(slot, proof, storageHash);
          expect(storageValue, 'value').toEqual(toPaddedHex(value));
        },
      };
    },
  };
}

describe('merkle', async () => {
  test(`nonexistent EOA does not exist`, async () => {
    const T = await setup();
    const P = await T.prover();
    await P.assertAccount(toPaddedHex(0xdead, 20), false);
  });

  test('EOA with balance exists', async () => {
    const T = await setup();
    const P = await T.prover();
    await P.assertAccount(T.foundry.wallets.admin.address, true);
  });

  test('empty contract', async () => {
    const T = await setup();
    const C = await T.foundry.deploy('contract C {}');
    const P = await T.prover();
    await P.assertValue(C.target, 0);
  });

  test('slotless contract', async () => {
    const T = await setup();
    const C = await T.foundry.deploy(`
      contract C {
        function set(uint256 slot, uint256 value) external {
          assembly { sstore(slot, value) }
        }
      }
    `);
    const P1 = await T.prover();
    await P1.assertValue(C.target, 0); // unset
    await T.foundry.confirm(C.set(0, 1)); // make change
    await P1.assertValue(C.target, 0); // not visible to prover
    const P2 = await T.prover(); // new prover
    await P2.assertValue(C.target, 0); // visible
  });

  test('slotted contract', async () => {
    const T = await setup();
    const C = await T.foundry.deploy(`
      contract C {
        uint256 slot0 = 0;
        uint256 slot1 = 1;
        function set(uint256 slot, uint256 value) external {
          assembly { sstore(slot, value) }
        }
      }
    `);
    const P1 = await T.prover();
    await P1.assertValue(C.target, 0); // init
    await P1.assertValue(C.target, 1); // init
    await P1.assertValue(C.target, 2); // unset
    await T.foundry.confirm(C.set(0, 1)); // change slot 0
    await T.foundry.confirm(C.set(2, 1)); // change slot 2
    const P2 = await T.prover();
    await P2.assertValue(C.target, 0); // new value
    await P2.assertValue(C.target, 1); // unchanged
    await P2.assertValue(C.target, 2); // new value
  });
});
