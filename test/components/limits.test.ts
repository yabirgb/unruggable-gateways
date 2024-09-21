import { GatewayRequest, MAX_STACK } from '../../src/vm.js';
import { Foundry } from '@adraffy/blocksmith';
import { ethers } from 'ethers';
import { EthProver } from '../../src/eth/EthProver.js';
import { afterAll, test, expect } from 'bun:test';
import { describe } from '../bun-describe-fix.js';

describe('limits', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(() => foundry.shutdown());
  const MAX_BYTES = 257;
  const contract = await foundry.deploy({
    sol: `
	  contract X {
		bytes pass = new bytes(${MAX_BYTES});
		bytes fail = new bytes(${MAX_BYTES + 1});
	  }
	`,
  });

  async function exec(prover: EthProver, req: GatewayRequest) {
    const state = await prover.evalRequest(req);
    return prover.prove(state.needs);
  }

  test('max stack', async () => {
    const prover = await EthProver.latest(foundry.provider);
    const req = new GatewayRequest();
    for (let i = 0; i < MAX_STACK; i++) {
      req.push(0);
    }
    expect(exec(prover, req)).resolves.toBeDefined();
    req.push(0); // one more
    expect(exec(prover, req)).rejects.toThrow('stack overflow');
  });

  test('max targets', async () => {
    const prover = await EthProver.latest(foundry.provider);
    prover.maxUniqueTargets = 10;
    const req = new GatewayRequest();
    for (let i = 0; i < prover.maxUniqueTargets; i++) {
      req.setTarget(ethers.toBeHex(i, 20));
    }
    expect(exec(prover, req)).resolves.toBeDefined();
    req.setTarget('0x51050ec063d393217B436747617aD1C2285Aeeee'); // one more
    expect(exec(prover, req)).rejects.toThrow('too many targets');
  });

  test('max proven bytes', async () => {
    const prover = await EthProver.latest(foundry.provider);
    prover.maxUniqueProofs = 2 + Math.ceil(MAX_BYTES / 32); // account + length + slots
    prover.maxProvableBytes = MAX_BYTES;
    const passReq = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(0)
      .readBytes();
    const failReq = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(1)
      .readBytes();
    expect(exec(prover, passReq)).resolves.toBeDefined();
    expect(exec(prover, failReq)).rejects.toThrow(/^too many bytes:/);
  });

  test('max supplied bytes', async () => {
    const prover = await EthProver.latest(foundry.provider);
    prover.maxUniqueProofs = 2; // account + hashed
    prover.maxSuppliedBytes = MAX_BYTES;
    const passReq = new GatewayRequest()
      .setTarget(contract.target)
      .push(ethers.keccak256(new Uint8Array(MAX_BYTES)))
      .setSlot(0)
      .readHashedBytes();
    const failReq = new GatewayRequest()
      .setTarget(contract.target)
      .push(ethers.keccak256(new Uint8Array(MAX_BYTES + 1)))
      .setSlot(1)
      .readHashedBytes();
    expect(exec(prover, passReq)).resolves.toBeDefined();
    expect(exec(prover, failReq)).rejects.toThrowError(/^too many bytes:/);
  });

  test('max proofs', async () => {
    const prover = await EthProver.latest(foundry.provider);
    prover.maxUniqueProofs = 10;
    const req = new GatewayRequest();
    req.setTarget(contract.target); // account is 1 proof, so we skip 1
    for (let i = 1; i < prover.maxUniqueProofs; i++) {
      req.setSlot(i).read().pop(); // pop prevents stack overflow
    }
    expect(exec(prover, req)).resolves.toBeDefined();
    req.setSlot(0).read(); // one more
    expect(exec(prover, req)).rejects.toThrow(/^too many proofs:/);
  });
});
