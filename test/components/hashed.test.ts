import { Foundry } from '@adraffy/blocksmith';
import { GatewayRequest } from '../../src/vm.js';
import { EthProver } from '../../src/eth/EthProver.js';
import { ethers } from 'ethers';
import { test, expect } from 'bun:test';
import { describe } from '../bun-describe-fix.js';

describe('hashed', async (afterAll) => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(() => foundry.shutdown());
  const verifier = await foundry.deploy({
    file: 'EthSelfVerifier',
  });
  const bytes = ethers.hexlify(ethers.randomBytes(12345));
  const contract = await foundry.deploy({
    sol: `
      contract X {
        struct Prefixed {
          bytes32 hash;
          bytes value;
        }
        Prefixed prefixedValue;
        mapping (uint256 => Prefixed) prefixedMap;
        mapping (uint256 => bytes32) hashMap;
        mapping (uint256 => bytes) valueMap;
        constructor(bytes memory v) {
          update(prefixedValue, v);
          update(prefixedMap[1337], v);
          valueMap[123] = v;
          hashMap[123] = keccak256(v);
        }
        function update(Prefixed storage p, bytes memory v) internal {
          p.value = v;
          p.hash = keccak2 56(v);
        }
      }
    `,
    args: [bytes],
  });
  async function verify(req: GatewayRequest) {
    const prover = await EthProver.latest(foundry.provider);
    const stateRoot = await prover.fetchStateRoot();
    const vm = await prover.evalRequest(req);
    const proofSeq = await prover.prove(vm.needs);
    const values = await vm.resolveOutputs();
    const res = await verifier.verify(
      req.toTuple(),
      stateRoot,
      proofSeq.proofs,
      proofSeq.order
    );
    expect(res.outputs.toArray()).toEqual(values);
    expect(res.exitCode).toBe(BigInt(vm.exitCode));
    return { values, ...vm };
  }

  test('prefixed: direct', async () => {
    const { values } = await verify(
      new GatewayRequest()
        .setTarget(contract.target)
        .setSlot(0) // prefixed.hash
        .read()
        .setSlot(1) // prefixed.value
        .readHashedBytes()
        .addOutput()
    );
    expect(values[0]).toEqual(bytes);
  });

  test('prefixed: mapped', async () => {
    const { values } = await verify(
      new GatewayRequest()
        .setTarget(contract.target)
        .setSlot(2)
        .push(1337)
        .follow() // prefixedMap[1337]
        .read()
        .offset(1)
        .readHashedBytes()
        .addOutput()
    );
    expect(values[0]).toEqual(bytes);
  });

  test('split', async () => {
    const { values } = await verify(
      new GatewayRequest()
        .setTarget(contract.target)
        .setSlot(3)
        .push(123)
        .follow() // hashMap[123]
        .read()
        .setSlot(4)
        .push(123)
        .follow() // valueMap[123]
        .readHashedBytes()
        .addOutput()
    );
    expect(values[0]).toEqual(bytes);
  });
});
