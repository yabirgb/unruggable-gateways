import { EVMProver } from '../../src/vm.js';
import { Foundry } from '@adraffy/blocksmith';
import { describe, afterAll, test, expect } from 'bun:test';

describe('proofs', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(() => foundry.shutdown());
  const contract = await foundry.deploy({
    sol: `
      contract C {
        uint256 value1 = 1;
        uint256 value2 = 2;
      }
    `,
  });

  let fetchedCalls: number;
  let fetchedSlots: number;
  resetStats();
  function resetStats() {
    fetchedCalls = 0;
    fetchedSlots = 0;
  }
  foundry.provider.on('debug', (e) => {
    if (e.action === 'sendRpcPayload' && e.payload.method === 'eth_getProof') {
      fetchedCalls++;
      fetchedSlots += e.payload.params[1].length;
    }
  });

  test('reconstruction: empty', async () => {
    const prover = await EVMProver.latest(foundry.provider);
    const p0 = await prover.fetchProofs(contract.target);
    const p1 = await prover.getProofs(contract.target);
    expect(p0).toEqual(p1);
  });

  test('reconstruction: 1 slot', async () => {
    const prover = await EVMProver.latest(foundry.provider);
    const slots = [0n];
    const p0 = await prover.fetchProofs(contract.target, slots);
    const p1 = await prover.getProofs(contract.target, slots);
    expect(p0).toEqual(p1);
  });

  test('reconstruction: 3 slot reversed', async () => {
    const prover = await EVMProver.latest(foundry.provider);
    const slots = [2n, 0n, 1n];
    const p0 = await prover.fetchProofs(contract.target, slots);
    const p1 = await prover.getProofs(contract.target, slots);
    expect(p0).toEqual(p1);
  });

  test('reconstruction: batched', async () => {
    const prover = await EVMProver.latest(foundry.provider);
    const slots = [0n, 1n];
    const p0 = await prover.fetchProofs(contract.target, slots);
    const p1 = await prover.fetchProofs(contract.target, slots, 1);
    expect(p0).toEqual(p1);
  });

  test('reconstruction: batched cached', async () => {
    const prover = await EVMProver.latest(foundry.provider);
    const slots = [0n, 1n];
    const p0 = await prover.getProofs(contract.target, slots);
    resetStats();
    const p1 = await prover.getProofs(contract.target, slots, 1);
    expect(fetchedCalls).toBe(0);
    expect(p0).toEqual(p1);
  });

  test('fetchProofs() batch = 1', async () => {
    const prover = await EVMProver.latest(foundry.provider);
    resetStats();
    await prover.fetchProofs(contract.target, [0n, 1n], 1);
    expect(fetchedCalls).toBe(2);
  });

  test('fetchProofs() batch > 1', async () => {
    const prover = await EVMProver.latest(foundry.provider);
    resetStats();
    await prover.fetchProofs(contract.target, [0n, 1n]);
    expect(fetchedCalls).toBe(1);
  });

  test('getProof() 01:10', async () => {
    const prover = await EVMProver.latest(foundry.provider);
    resetStats();
    const [p0, p1] = await Promise.all([
      prover.getProofs(contract.target, [0n, 1n]),
      prover.getProofs(contract.target, [1n, 0n]),
    ]);
    expect(fetchedCalls).toBe(1);
    expect(fetchedSlots).toBe(2);
    expect(p0.storageProof[0]).toEqual(p1.storageProof[1]);
    expect(p0.storageProof[1]).toEqual(p1.storageProof[0]);
  });

  test('getProof() 01:12:02', async () => {
    const prover = await EVMProver.latest(foundry.provider);
    resetStats();
    const [p0, p1, p2] = await Promise.all([
      prover.getProofs(contract.target, [0n, 1n]),
      prover.getProofs(contract.target, [1n, 2n]),
      prover.getProofs(contract.target, [2n, 0n]),
    ]);
    expect(fetchedCalls).toBe(2);
    expect(fetchedSlots).toBe(3);
    expect(p0.storageProof[0]).toEqual(p2.storageProof[1]); // 0
    expect(p0.storageProof[1]).toEqual(p1.storageProof[0]); // 1
    expect(p1.storageProof[1]).toEqual(p2.storageProof[0]); // 2
  });

  test('getProof() 012345:012:345', async () => {
    const prover = await EVMProver.latest(foundry.provider);
    resetStats();
    const [p0, p1, p2] = await Promise.all([
      prover.getProofs(contract.target, [0n, 1n, 2n, 3n, 4n, 5n]),
      prover.getProofs(contract.target, [0n, 1n, 2n]),
      prover.getProofs(contract.target, [3n, 4n, 5n]),
    ]);
    expect(fetchedCalls).toBe(1);
    expect(fetchedSlots).toBe(6);
    expect(p0.storageProof).toEqual(p1.storageProof.concat(p2.storageProof));
  });
});
