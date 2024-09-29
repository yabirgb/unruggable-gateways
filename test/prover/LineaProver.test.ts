import { Foundry } from '@adraffy/blocksmith';
import { createProviderPair, providerURL } from '../providers.js';
import { LineaRollup } from '../../src/linea/LineaRollup.js';
import { ZeroHash } from 'ethers/constants';
import { test, expect, afterAll } from 'bun:test';
import { toPaddedHex } from '../../src/utils.js';
import { describe } from '../bun-describe-fix.js';

describe('LineaProver', async () => {
  const config = LineaRollup.mainnetConfig;
  const gateway = new LineaRollup(createProviderPair(config), config);
  const commit = await gateway.fetchLatestCommit();
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());

  const verifier = await foundry.deploy({
    file: 'LineaSelfVerifier',
    libs: {
      SparseMerkleProof: config.SparseMerkleProof,
    },
  });

  test('dne', async () => {
    const target = '0x0000000000000000000000000000000000001234';
    expect(await commit.prover.isContract(target)).toBeFalse();
    const proof = await commit.prover.prove([{ target, required: true }]);
    const storageRoot = await verifier.proveAccountState(
      commit.stateRoot,
      target,
      proof.proofs[0]
    );
    expect(storageRoot).toStrictEqual(ZeroHash);
  });

  test('eoa', async () => {
    const target = '0x51050ec063d393217B436747617aD1C2285Aeeee';
    expect(await commit.prover.isContract(target)).toBeFalse();
    const proof = await commit.prover.prove([{ target, required: true }]);
    const storageRoot = await verifier.proveAccountState(
      commit.stateRoot,
      target,
      proof.proofs[0]
    );
    expect(storageRoot).toStrictEqual(ZeroHash);
  });

  test('contract', async () => {
    const target = '0x48F5931C5Dbc2cD9218ba085ce87740157326F59'; // SlotDataReader
    expect(await commit.prover.isContract(target)).toBeTrue();
    const proof = await commit.prover.prove([{ target, required: true }, 0n]);
    const storageRoot = await verifier.proveAccountState(
      commit.stateRoot,
      target,
      proof.proofs[0]
    );
    expect(storageRoot).not.toStrictEqual(ZeroHash);
    const storageValue = await verifier.proveStorageValue(
      storageRoot,
      target,
      0n,
      proof.proofs[1]
    );
    expect(storageValue).toStrictEqual(toPaddedHex(49));
  });

  test('shomei issue #97', async () => {
    // https://raffy.antistupid.com/eth/linea-proof-bug.html
    // https://github.com/Consensys/shomei/issues/97
    const target = '0x176211869cA2b568f2A7D4EE941E073a821EE1ff'; // USDC
    expect(await commit.prover.isContract(target)).toBeTrue();
    const slot1 =
      0xcb0cbc8493baf4a7b1972914ba0be89040e56e4a3c98d60268fe37b8c8e546d8n;
    const slot2 = 49n;
    const proof = await commit.prover.prove([
      { target, required: true },
      slot1,
      slot2,
    ]);
    const storageRoot = await verifier.proveAccountState(
      commit.stateRoot,
      target,
      proof.proofs[0]
    );
    expect(storageRoot).not.toStrictEqual(ZeroHash);
    expect(
      verifier.proveStorageValue(storageRoot, target, slot1, proof.proofs[1])
    ).rejects.toThrow(/InvalidProof/);
    expect(
      verifier.proveStorageValue(storageRoot, target, slot2, proof.proofs[2])
    ).rejects.toThrow(/InvalidProof/);
    // const storageValue = await verifier.proveStorageValue(
    //   storageRoot,
    //   target,
    //   0n,
    //   proof.proofs[1]
    // );
    // expect(storageValue).toStrictEqual(ZeroHash);
  });
});
