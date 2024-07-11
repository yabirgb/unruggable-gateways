import { EVMProver, EVMRequest, MAX_STACK } from '../../src/vm.js';
import { Foundry } from '@adraffy/blocksmith';
import { ethers } from 'ethers';
import { afterAll, test, expect, describe } from 'bun:test';

describe('limits', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(() => foundry.shutdown());
  const contract = await foundry.deploy({
    sol: `
      contract X {
        uint256[] array = [${Array.from({ length: 512 }, (_, i) => i)}];
      }
    `,
  });
  const prover = await EVMProver.latest(foundry.provider);
  async function exec(r: EVMRequest) {
    const state = await prover.evalRequest(r);
    return prover.prove(state.needs);
  }
  //afterAll(async () => console.log(await prover.cachedMap()));

  test('max stack', async () => {
    const req = new EVMRequest();
    for (let i = 0; i < MAX_STACK; i++) {
      req.push(0);
    }
    expect(exec(req)).resolves.toBeDefined();
    req.push(0); // one more
    expect(exec(req)).rejects.toThrow('stack overflow');
  });

  test('max targets', async () => {
    const req = new EVMRequest();
    for (let i = 0; i < prover.maxUniqueTargets; i++) {
      req.setTarget(ethers.toBeHex(i, 20));
    }
    expect(exec(req)).resolves.toBeDefined();
    req.setTarget('0x51050ec063d393217B436747617aD1C2285Aeeee'); // one more
    expect(exec(req)).rejects.toThrow('too many targets');
  });

  test('max bytes', async () => {
    const slots = prover.maxReadBytes >> 5;
    expect(slots).toBeLessThan(255); // since +1
    expect(exec(new EVMRequest().read(slots))).resolves.toBeDefined();
    expect(exec(new EVMRequest().read(slots + 1))).rejects.toThrow(
      /^too many bytes:/
    );
  });

  test('max proofs', async () => {
    const req = new EVMRequest();
    req.setTarget(contract.target);
    for (let i = 1; i < prover.maxUniqueProofs; i++) {
      // one less
      req.setSlot(i).read().pop();
    }
    expect(exec(req)).resolves.toBeDefined();
    req.setSlot(0).read(); // one more
    expect(exec(req)).rejects.toThrow(/^too many proofs:/);
  });
});
