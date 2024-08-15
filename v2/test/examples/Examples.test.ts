import { EVMRequest } from '../../src/vm.js';
import { EVMProver } from '../../src/evm/prover.js';
import { Foundry } from '@adraffy/blocksmith';
import { ethers } from 'ethers';
import { test, afterAll, expect } from 'bun:test';

test('ClowesConcatSlice', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(() => foundry.shutdown());

  const SIZE = 73;
  const FIRST = 8;
  const LAST = 5;
  const VALUE = 1337;

  const data = ethers.hexlify(ethers.randomBytes(SIZE));
  const key = ethers.concat([
    ethers.dataSlice(data, 0, FIRST),
    ethers.dataSlice(data, -LAST),
  ]);

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

  const prover = await EVMProver.latest(foundry.provider);

  const r = new EVMRequest(2)
    .setTarget(contract.target)
    .setSlot(0)
    .readBytes()
    .setOutput(0)
    .pushOutput(0)
    .slice(0, FIRST)
    .pushOutput(0)
    .slice(SIZE - LAST, LAST)
    .concat(2)
    .setSlot(1)
    .follow()
    .read()
    .setOutput(1);

  const values = await prover.evalRequest(r).then((r) => r.resolveOutputs());

  expect(values).toHaveLength(2);
  expect(values[0]).toStrictEqual(data);
  expect(values[1]).toStrictEqual(ethers.toBeHex(VALUE, 32));
});
