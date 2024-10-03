import { GatewayProgram, GatewayRequest } from '../../src/vm.js';
import type { BigNumberish } from '../../src/types.js';
import { EthProver } from '../../src/eth/EthProver.js';
import { Foundry } from '@adraffy/blocksmith';
import { ZeroAddress } from 'ethers/constants';
import { id as keccakStr } from 'ethers/hash';
import { randomBytes } from 'ethers/crypto';
import { hexlify, dataSlice, toUtf8Bytes, concat } from 'ethers/utils';
import { toPaddedHex } from '../../src/utils.js';
import { afterAll, expect, test } from 'bun:test';
import { describe } from '../bun-describe-fix.js';

function rngUint(n = 32) {
  return BigInt(hexlify(randomBytes(n)));
}
function utf8Hex(s: string) {
  return hexlify(toUtf8Bytes(s));
}
function toPaddedArray(v: BigNumberish[]) {
  return v.map((x) => toPaddedHex(x));
}

describe('ops', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(() => foundry.shutdown());
  const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
  const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
  const verifier = await foundry.deploy({
    file: 'SelfVerifier',
    args: [[], 0, hooks],
    libs: { GatewayVM },
  });
  const contract = await foundry.deploy(`
    contract X {
      uint256 value1 = 1;
      uint256 value2 = 2;
      string small = "abc";
      string big = "${'abc'.repeat(20)}";
      uint96[] array = [1, 2, 3];
      string[] names = ["abc", "raffy", "chonk"];
      mapping (string => string) map;
      constructor() {
        map["raffy"] = "raffy";
      }
    }
  `);

  async function verify(req: GatewayRequest) {
    const prover = await EthProver.latest(foundry.provider);
    const stateRoot = await prover.fetchStateRoot();
    const state = await prover.evalRequest(req);
    const [proofSeq, values, stack] = await Promise.all([
      prover.prove(state.needs),
      state.resolveOutputs(),
      state.resolveStack(),
    ]);
    const res = await verifier.verify(
      req.toTuple(),
      stateRoot,
      proofSeq.proofs,
      proofSeq.order
    );
    expect(res.outputs.toArray()).toEqual(values);
    expect(res.exitCode).toEqual(BigInt(state.exitCode));
    return { ...state, values, stack, proofSeq };
  }

  function testRepeat(label: string, fn: () => Promise<void>, n = 10) {
    test(`${label} x${n}`, async () => {
      for (let i = 0; i < n; i++) {
        await fn();
      }
    });
  }

  test('missing args', async () => {
    // TODO: finish this list
    const ops: (keyof typeof GatewayRequest.Opcode)[] = [
      'TARGET',
      'SLOT',
      'SET_OUTPUT',
      'CONCAT',
      'KECCAK',
      'SLICE',
      'PLUS',
      'NOT',
    ];
    for (const op of ops) {
      expect(verify(new GatewayRequest().op(op))).rejects.toThrow(
        'stack underflow'
      );
    }
  });

  test('setOutput', async () => {
    const req = new GatewayRequest(1).push(1).setOutput(0);
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(1));
  });

  test('addOutput', async () => {
    const req = new GatewayRequest().push(1).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(1));
  });

  test('setOutput overflow', async () => {
    const req = new GatewayRequest().push(1).setOutput(0);
    expect(verify(req)).rejects.toThrow(/invalid output index: \d+/);
  });

  test('setSlot', async () => {
    const req = new GatewayRequest().push(123).slot().pushSlot().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(123));
  });

  test('addSlot', async () => {
    const req = new GatewayRequest().push(123).addSlot().pushSlot().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(123));
  });

  test('stack size', async () => {
    const req = new GatewayRequest();
    req.pushStackSize();
    req.pushStackSize();
    req.pushStackSize();
    const { values } = await verify(req.drain(3));
    expect(values).toEqual(toPaddedArray([0, 1, 2]));
  });

  test('length', async () => {
    const req = new GatewayRequest();
    req.push(1).length();
    req.pushStr('chonk').length();
    req.pushBytes('0xABCD').length();
    const { values } = await verify(req.drain(3));
    expect(values).toEqual(toPaddedArray([32, 5, 2]));
  });

  test('keccak', async () => {
    const req = new GatewayRequest();
    req.pushStr('').keccak().addOutput();
    req.pushStr('chonk').keccak().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(keccakStr(''));
    expect(values[1]).toEqual(keccakStr('chonk'));
  });

  test('slice', async () => {
    const small = '0x112233445566778899';
    const big = Uint8Array.from({ length: 500 }, (_, i) => i);
    const req = new GatewayRequest();
    req.pushBytes(small).slice(4, 3).addOutput();
    req.pushBytes(big).slice(300, 5).addOutput();
    req.pushBytes('0x').slice(0, 0).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(dataSlice(small, 4, 4 + 3));
    expect(values[1]).toEqual(hexlify(big.slice(300, 300 + 5)));
    expect(values[2]).toEqual('0x');
  });

  test('slice extend', async () => {
    const req = new GatewayRequest()
      .pushBytes('0x1234')
      .slice(0, 4)
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual('0x12340000');
  });

  test('push(0).slice(0, 1000)', async () => {
    const req = new GatewayRequest().push(0).slice(0, 1000).addOutput();
    const { values } = await verify(req);
    expect(values).toEqual([hexlify(new Uint8Array(1000))]);
  });

  test('concat ints', async () => {
    const req = new GatewayRequest().push(1).push(2).concat().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(concat([toPaddedHex(1), toPaddedHex(2)]));
  });

  test('concat string x2', async () => {
    const req = new GatewayRequest();
    req.pushStr('r').pushStr('af').pushStr('fy');
    req.concat().concat().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(utf8Hex('raffy'));
  });

  function testBinary(
    op: keyof GatewayRequest,
    fn: (a: bigint, b: bigint) => bigint
  ) {
    testRepeat(op, async () => {
      const a = rngUint();
      const b = rngUint();
      const req = new GatewayRequest().push(a).push(b);
      (req as any)[op]().addOutput(); // sigh
      const { values } = await verify(req);
      expect(values[0]).toEqual(toPaddedHex(fn(a, b)));
    });
  }

  testBinary('plus', (a, b) => a + b);
  testBinary('subtract', (a, b) => a - b);
  testBinary('times', (a, b) => a * b);
  testBinary('divide', (a, b) => a / b);
  testBinary('mod', (a, b) => a % b);
  testBinary('and', (a, b) => a & b);
  testBinary('or', (a, b) => a | b);
  testBinary('xor', (a, b) => a ^ b);
  testBinary('min', (a, b) => (a < b ? a : b));
  testBinary('max', (a, b) => (a > b ? a : b));

  function testCompare(
    op: keyof GatewayRequest,
    fn: (a: bigint, b: bigint) => boolean
  ) {
    test(op, async () => {
      const v = [0n, 1n, 2n];
      for (const a of v) {
        for (const b of v) {
          const req = new GatewayRequest().push(a).push(b);
          (req as any)[op]().addOutput(); // sigh
          const { values } = await verify(req);
          expect(values[0]).toEqual(toPaddedHex(fn(a, b)));
        }
      }
    });
  }

  testCompare('eq', (a, b) => a == b);
  testCompare('neq', (a, b) => a != b);
  testCompare('lt', (a, b) => a < b);
  testCompare('gt', (a, b) => a > b);
  testCompare('gte', (a, b) => a >= b);
  testCompare('lte', (a, b) => a <= b);

  test('accumulate', async () => {
    const req = new GatewayRequest();
    req.push(0);
    let sum = 0n;
    for (let i = 0; i < 1000; i++) {
      const x = rngUint();
      req.push(x).plus();
      sum += x;
    }
    req.addOutput();
    const state = await verify(req);
    expect(state.values[0]).toEqual(toPaddedHex(sum));
  });

  test('plus wraps', async () => {
    const req = new GatewayRequest().push(3).push(-1).plus().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(2));
  });

  test('times wraps', async () => {
    const req = new GatewayRequest().push(2).push(-1).times().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(-2));
  });

  test('divide by zero', async () => {
    const req = new GatewayRequest().push(1).push(0).divide().addOutput();
    expect(verify(req)).rejects.toThrow('divi'); // NOTE: node/bun use diff message
  });

  test('not', async () => {
    const req = new GatewayRequest().push(0).not().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(-1n));
  });

  test('flip', async () => {
    const req = new GatewayRequest();
    req.push(0).flip(); // false -> true
    req.push(2).flip(); // true -> false
    req.push(1).flip().flip(); // true -> false -> true
    const { values } = await verify(req.drain(3));
    expect(values).toEqual(toPaddedArray([1, 0, 1]));
  });

  testRepeat('shift left', async () => {
    const x = rngUint();
    const shift = rngUint(1);
    const req = new GatewayRequest().push(x).shl(shift).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(x << shift));
  });

  testRepeat('shift right', async () => {
    const x = rngUint();
    const shift = rngUint(1);
    const req = new GatewayRequest().push(x).shr(shift).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(x >> shift));
  });

  test('cast to uint256', async () => {
    const value = '0x88';
    const req = new GatewayRequest()
      .pushBytes(value) // NOTE: not push()
      .dup()
      .addOutput()
      .push(0)
      .or() // turns bytes(0x88) into uint256(0x88)
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(value);
    expect(values[1]).toEqual(toPaddedHex(value));
  });

  test('dup last', async () => {
    const req = new GatewayRequest().push(1).dup();
    const { values } = await verify(req.drain(2));
    expect(values).toEqual(toPaddedArray([1, 1]));
  });

  test('dup deep', async () => {
    const req = new GatewayRequest().push(1).push(2).push(3).dup(2);
    const { values } = await verify(req.drain(4));
    expect(values).toEqual(toPaddedArray([1, 2, 3, 1]));
  });

  test('dup nothing is error', async () => {
    const req = new GatewayRequest().dup();
    expect(verify(req)).rejects.toThrow('back overflow');
  });

  test('dup2', async () => {
    const req = new GatewayRequest().push(1).push(2).dup2();
    const { values } = await verify(req.drain(4));
    expect(values).toEqual(toPaddedArray([1, 2, 1, 2]));
  });

  test('swap', async () => {
    const req = new GatewayRequest().push(1).push(2).swap();
    const { values } = await verify(req.drain(2));
    expect(values).toEqual(toPaddedArray([2, 1]));
  });

  test('swap nothing is error', async () => {
    const req = new GatewayRequest().swap();
    expect(verify(req)).rejects.toThrow('back overflow');
  });

  test('swap mixed', async () => {
    const req = new GatewayRequest()
      .pushStr('chonk')
      .push(1)
      .swap()
      .addOutput()
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(utf8Hex('chonk'));
    expect(values[1]).toEqual(toPaddedHex(1));
  });

  test('pop', async () => {
    const req = new GatewayRequest().push(1).push(2).pop().addOutput();
    const { values } = await verify(req);
    expect(values.length).toEqual(1);
    expect(values[0]).toEqual(toPaddedHex(1));
  });

  test('pop nothing is allowed', async () => {
    const req = new GatewayRequest().pop();
    await verify(req);
  });

  test('pushSlot', async () => {
    const value = 1337;
    const req = new GatewayRequest().setSlot(value).pushSlot().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(value));
  });

  test('pushTarget', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .pushTarget()
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(contract.target.toLowerCase());
  });

  test('pushOutput', async () => {
    const value = 1337;
    const req = new GatewayRequest(2)
      .push(value)
      .setOutput(0)
      .pushOutput(0)
      .setOutput(1);
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(value));
    expect(values[1]).toEqual(toPaddedHex(value));
  });

  test('follow value', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(6)
      .pushStr('raffy')
      .follow()
      .readBytes()
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(utf8Hex('raffy'));
  });

  test('followIndex value', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(5)
      .push(1) // names[1]
      .followIndex()
      .readBytes()
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(utf8Hex('raffy'));
  });

  test('string[]', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(5) // names
      .read() // length
      .dup()
      .addOutput()
      .push(1)
      .subtract()
      .followIndex() // names[length-1]
      .readBytes()
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(3));
    expect(values[1]).toEqual(utf8Hex('chonk'));
  });

  test('read', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(0)
      .read()
      .addOutput()
      .setSlot(1)
      .read()
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(1));
    expect(values[1]).toEqual(toPaddedHex(2));
  });

  test('read no target', async () => {
    const req = new GatewayRequest().read().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(0));
  });

  test('read(0)', async () => {
    const req = new GatewayRequest().read(0).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual('0x');
  });

  test('read(2)', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(0)
      .read(2)
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(concat([toPaddedHex(1), toPaddedHex(2)]));
  });

  test('readBytes small', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(2)
      .readBytes()
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(utf8Hex('abc'));
  });

  test('readBytes big', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(3)
      .readBytes()
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(utf8Hex('abc'.repeat(20)));
  });

  test('readArray', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(4)
      .readArray(96 >> 3)
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(
      '0x000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000020000000000000000000000010000000000000000000000000000000000000000000000000000000000000003'
    );
  });

  test('requireNonzero on zero', async () => {
    const req = new GatewayRequest().push(0).requireNonzero();
    const { exitCode } = await verify(req);
    expect(exitCode).toEqual(GatewayProgram.Exitcode.NOT_NONZERO);
  });

  test('requireNonzero on non-zero', async () => {
    const req = new GatewayRequest();
    req.push(1).requireNonzero();
    req.push('0x0001').requireNonzero();
    req.pushStr('abc').requireNonzero();
    const { exitCode } = await verify(req);
    expect(exitCode).toEqual(0);
  });

  test('requireContract on contract', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .requireContract();
    const { exitCode } = await verify(req);
    expect(exitCode).toEqual(0);
  });

  test('requireContract on null', async () => {
    const req = new GatewayRequest();
    req.setTarget(ZeroAddress).requireContract();
    const { exitCode } = await verify(req);
    expect(exitCode).toEqual(GatewayProgram.Exitcode.NOT_A_CONTRACT);
  });

  test('evalLoop requireContract', async () => {
    const req = new GatewayRequest();
    req.push(1);
    req.push(contract.target);
    req.push('0x51050ec063d393217B436747617aD1C2285Aeeee');
    req.push(toPaddedHex(0));
    req.pushProgram(new GatewayProgram().target().requireContract());
    req.evalLoop({ success: true, acquire: true });
    const { target, stack } = await verify(req);
    expect(target).toEqual(contract.target.toLowerCase());
    expect(stack).toHaveLength(0);
  });

  test('evalLoop requireNonzero', async () => {
    const req = new GatewayRequest(1);
    req.push(123);
    req.push(1337);
    req.push(0);
    req.pushStr('');
    req.pushProgram(new GatewayProgram().requireNonzero().setOutput(0));
    req.evalLoop({ success: true });
    const { values, stack } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(1337));
    expect(stack).toHaveLength(0);
  });

  test('evalLoop empty', async () => {
    const req = new GatewayRequest();
    req.pushProgram(new GatewayProgram().concat()); // this will throw if executed
    req.evalLoop(); // but no arguments are on the stack so it doesn't execute
    await verify(req);
  });

  // TODO: need more eval tests
  test('eval push from program', async () => {
    const req = new GatewayRequest(1);
    req.pushProgram(new GatewayProgram().push(1300).push(37));
    req.eval();
    req.plus().setOutput(0);
    const { values } = await verify(req);
    expect(values[0]).toStrictEqual(toPaddedHex(1337));
  });

  test('eval setOutput from program', async () => {
    const req = new GatewayRequest(1);
    req.push(1300).push(37);
    req.pushProgram(new GatewayProgram().plus().setOutput(0));
    req.eval();
    const { values } = await verify(req);
    expect(values[0]).toStrictEqual(toPaddedHex(1337));
  });
});
