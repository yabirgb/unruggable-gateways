import type { HexString, BigNumberish } from '../../src/types.js';
import { EthProver } from '../../src/eth/EthProver.js';
import {
  verifyAccountState,
  verifyStorageValue,
  NULL_TRIE_HASH,
} from '../../src/eth/merkle.js';
import { Foundry } from '@adraffy/blocksmith';
import { afterAll, test, expect } from 'bun:test';
import { toPaddedHex } from '../../src/utils.js';

async function setup() {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(() => foundry.shutdown());
  await foundry.nextBlock(); // force mine a block
  return {
    foundry,
    async prover() {
      const prover = await EthProver.latest(foundry.provider);
      const stateRoot = await prover.fetchStateRoot();
      return {
        async assertDoesNotExist(target: HexString) {
          const { accountProof } = await prover.getProofs(target);
          const accountState = verifyAccountState(
            target,
            accountProof,
            stateRoot
          );
          expect(accountState).toBeUndefined();
        },
        async assertValue(
          target: HexString,
          slot: BigNumberish,
          expected: BigNumberish
        ) {
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
          expect(accountState?.storageRoot).toEqual(storageHash);
          const slotValue = verifyStorageValue(slot, proof, storageHash);
          expect(slotValue).toEqual(toPaddedHex(value));
          expect(slotValue).toEqual(toPaddedHex(expected));
          const liveValue = await prover.provider.getStorage(target, slot);
          return {
            nullRoot: storageHash === NULL_TRIE_HASH,
            liveValue,
            slotValue,
            same: liveValue === slotValue,
          };
        },
      };
    },
  };
}

test(`nonexistent EOAs don't exist`, async () => {
  const T = await setup();
  const P = await T.prover();
  for (let i = 0; i < 5; i++) {
    await P.assertDoesNotExist(toPaddedHex(1, 20));
  }
});

test('EOA with balance exists', async () => {
  const T = await setup();
  const P = await T.prover();
  const V = await P.assertValue(T.foundry.wallets.admin.address, 0, 0);
  expect(V.nullRoot).toBeTrue();
});

test('empty contract', async () => {
  const T = await setup();
  const C = await T.foundry.deploy({ sol: `contract C {}` });
  const P = await T.prover();
  await P.assertValue(C.target, 0, 0);
});

test('slotless contract', async () => {
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
      contract C {
        function set(uint256 slot, uint256 value) external {
          assembly { sstore(slot, value) }
        }
      }
    `,
  });
  const P1 = await T.prover();
  await P1.assertValue(C.target, 0, 0); // unset
  await T.foundry.confirm(C.set(0, 1)); // make change
  await P1.assertValue(C.target, 0, 0); // not visible to prover
  const P2 = await T.prover(); // new prover
  await P2.assertValue(C.target, 0, 1); // visible
});

test('slotted contract', async () => {
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
      contract C {
        uint256 slot0 = 0;
        uint256 slot1 = 1;
        function set(uint256 slot, uint256 value) external {
          assembly { sstore(slot, value) }
        }
      }
    `,
  });
  const P1 = await T.prover();
  await P1.assertValue(C.target, 0, 0); // init
  await P1.assertValue(C.target, 1, 1); // init
  await P1.assertValue(C.target, 2, 0); // unset

  await T.foundry.confirm(C.set(0, 1)); // change slot 0
  await T.foundry.confirm(C.set(2, 1)); // change slot 2

  expect(
    P1.assertValue(C.target, 0, 0).then((x) => x.same),
    'expected slot(0) is diff'
  ).resolves.toBeFalse();
  expect(
    P1.assertValue(C.target, 1, 1).then((x) => x.same),
    'expected slot(1) is same'
  ).resolves.toBeTrue();
  expect(
    P1.assertValue(C.target, 2, 0).then((x) => x.same),
    'expected slot(2) is diff'
  ).resolves.toBeFalse();

  const P2 = await T.prover();
  await P2.assertValue(C.target, 0, 1); // new value
  await P2.assertValue(C.target, 2, 1); // new value
});
