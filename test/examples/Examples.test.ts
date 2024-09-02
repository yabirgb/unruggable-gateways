import { EVMRequest } from '../../src/vm.js';
import { EthProver } from '../../src/eth/EthProver.js';
import { Foundry } from '@adraffy/blocksmith';
import { hexlify, toBeHex, randomBytes, concat, dataSlice } from 'ethers';
import { test, afterAll, expect } from 'bun:test';

test('ClowesConcatSlice', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(() => foundry.shutdown());

  const SIZE = 73;
  const FIRST = 8;
  const LAST = 5;
  const VALUE = 1337;

  const data = hexlify(randomBytes(SIZE));
  const key = concat([dataSlice(data, 0, FIRST), dataSlice(data, -LAST)]);

  const contract = await foundry.deploy({
    sol: `
      contract C {
        bytes slot0;
        mapping (bytes => uint256) slot1;
        constructor(bytes memory data, bytes memory key, uint256 value) {
          slot0 = data;
          slot1[key] = value;
        }
      }
  `,
    args: [data, key, VALUE],
  });

  const prover = await EthProver.latest(foundry.provider);

  const req = new EVMRequest(2)
    .setTarget(contract.target)
    .setSlot(0)
    .readBytes()
    .setOutput(0)
    .pushOutput(0)
    .slice(0, FIRST)
    .pushOutput(0)
    .slice(SIZE - LAST, LAST)
    .concat()
    .setSlot(1)
    .follow()
    .read()
    .setOutput(1);

  const values = await prover.evalRequest(req).then((r) => r.resolveOutputs());

  expect(values).toHaveLength(2);
  expect(values[0]).toStrictEqual(data);
  expect(values[1]).toStrictEqual(toBeHex(VALUE, 32));
});

test('FOLLOW === PUSH_SLOT CONCAT KECCAK SLOT_ZERO SLOT_ADD', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(() => foundry.shutdown());
  const contract = await foundry.deploy({
    sol: `
      contract X {
        mapping (uint256 => uint256) map;
        constructor() {
          map[1] = 2;
        }
      }
    `,
  });
  const prover = await EthProver.latest(foundry.provider);

  const req1 = new EVMRequest()
    .setTarget(contract.target)
    .push(1)
    .follow()
    .read()
    .addOutput();

  const req2 = new EVMRequest()
    .setTarget(contract.target)
    .push(1)
    .pushSlot()
    .concat()
    .keccak()
    .zeroSlot()
    .addSlot()
    .read()
    .addOutput();

  // the requests should be different
  expect(Bun.deepEquals(req1.ops, req2.ops)).toStrictEqual(false);

  // the outputs should be the same
  expect(
    Bun.deepEquals(
      await prover.evalRequest(req1).then((x) => x.resolveOutputs()),
      await prover.evalRequest(req2).then((x) => x.resolveOutputs())
    )
  ).toStrictEqual(true);
});
