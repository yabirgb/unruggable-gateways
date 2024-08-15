import { EVMRequest } from '../../src/vm.js';
import { EthProver } from '../../src/eth/EthProver.js';
import { Foundry } from '@adraffy/blocksmith';
import { test, afterAll } from 'bun:test';
import assert from 'node:assert/strict';

test('FOLLOW === PUSH_SLOT CONCAT(2) KECCAK SLOT_ZERO SLOT_ADD', async () => {
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

  const r1 = new EVMRequest()
    .setTarget(contract.target)
    .push(1)
    .follow()
    .read()
    .addOutput();
  const r2 = new EVMRequest()
    .setTarget(contract.target)
    .push(1)
    .pushSlot()
    .concat(2)
    .keccak()
    .zeroSlot()
    .addSlot()
    .read()
    .addOutput();

  assert.notDeepEqual(r1.ops, r2.ops);
  assert.deepEqual(
    await prover.evalRequest(r1).then((x) => x.resolveOutputs()),
    await prover.evalRequest(r2).then((x) => x.resolveOutputs())
  );
});
