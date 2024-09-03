import type { HexString } from '../../../src/types.js';
import { ethers } from 'ethers';
import { Foundry } from '@adraffy/blocksmith';
import { DataRequest } from '../../../src/vm.js';
import { EthProver } from '../../../src/eth/EthProver.js';
import { decodeStorageArray } from '../../utils.js';
import { test, afterAll, expect } from 'bun:test';

//Helper function to generate a random 32 byte hex string
function random32(): HexString {
  return ethers.hexlify(ethers.randomBytes(32));
}

//Setup for initalizing Foundry, deploying our basic verifier contract (to test against), and creating a prover function to interface with the verifier
async function setup() {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(() => foundry.shutdown());
  const verifier = await foundry.deploy({
    file: 'EthSelfVerifier',
    args: [], // only using merkle, not scroll
  });
  return {
    foundry,
    verifier,
    async prover() {
      // create an snapshot to prove against
      // can be invoked multiple times to observe changes
      const prover = await EthProver.latest(this.foundry.provider);
      const stateRoot = await prover.fetchStateRoot();
      return {
        prover,
        stateRoot,
        async prove(req: DataRequest) {
          const vm = await this.prover.evalRequest(req);
          const { proofs, order } = await this.prover.prove(vm.needs);
          const values = await vm.resolveOutputs();
          // console.log('ops', req.ops);
          // console.log('inputs', req.inputs);
          // console.log('outputs', values);
          const res = await verifier.verify(
            [Uint8Array.from(req.ops), req.inputs],
            stateRoot,
            proofs,
            order
          );
          // require js == solc
          expect(res.outputs.toArray()).toEqual(values);
          expect(res.exitCode).toBe(BigInt(vm.exitCode));
          return { values, ...vm };
        },
      };
    },
  };
}

test('get uint256', async () => {
  const VALUE = random32();
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
      contract C {
        uint256 slot0 = ${VALUE};
      }
    `,
  });
  const P = await T.prover();
  //Build a request using our Typescript API
  const { values, exitCode } = await P.prove(
    new DataRequest(1).setTarget(C.target).setSlot(0).read().setOutput(0)
  );
  expect(exitCode).toStrictEqual(0);
  expect(values[0]).toStrictEqual(VALUE);
});

test('get random values from random slots', async () => {
  const LENGTH_TO_USE = 5;
  const XY = Array.from({ length: LENGTH_TO_USE }, () => {
    return [random32(), random32()];
  });
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
      contract C {
        constructor() {
          assembly {
            ${XY.map(([x, y]) => `sstore(${x}, ${y})`).join('\n')}
          }
        }
      }
    `,
  });
  const P = await T.prover();
  const req = new DataRequest(LENGTH_TO_USE).setTarget(C.target);
  XY.forEach(([x], i) => req.setSlot(x).read().setOutput(i));
  const { values, exitCode } = await P.prove(req);
  expect(exitCode).toStrictEqual(0);
  expect(values).toHaveLength(XY.length);
  XY.forEach(([, y], i) => expect(values[i]).toStrictEqual(y));
});

test('get small and long string', async () => {
  const SMALL = 'chonk';
  const LARGE = SMALL.repeat(13);
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
      contract C {
        string small = "${SMALL}";
        string large = "${LARGE}";
      }
    `,
  });
  const P = await T.prover();
  const { values, exitCode } = await P.prove(
    new DataRequest(2)
      .setTarget(C.target)
      .setSlot(0)
      .readBytes()
      .setOutput(0)
      .setSlot(1)
      .readBytes()
      .setOutput(1)
  );
  expect(exitCode).toStrictEqual(0);
  expect(ethers.toUtf8String(values[0])).toStrictEqual(SMALL);
  expect(ethers.toUtf8String(values[1])).toStrictEqual(LARGE);
});

test('get small string from mapping', async () => {
  const EXAMPLE_STRING = 'chonk';
  const MAPPING_KEY = 42;
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
      contract C {
        mapping(uint256 => string) exampleMapping;
        constructor() {
          exampleMapping[${MAPPING_KEY}] = "${EXAMPLE_STRING}";
        }
      }
    `,
  });
  const P = await T.prover();
  const { values, exitCode } = await P.prove(
    new DataRequest(1)
      .setTarget(C.target)
      .setSlot(0)
      .push(MAPPING_KEY)
      .follow()
      .readBytes()
      .setOutput(0)
  );
  expect(exitCode).toStrictEqual(0);
  expect(ethers.toUtf8String(values[0])).toStrictEqual(EXAMPLE_STRING);
});

test('get long string from mapping', async () => {
  const SMALL = 'chonk';
  const EXAMPLE_STRING = SMALL.repeat(13);
  const MAPPING_KEY = 42;
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
      contract C {
        mapping(uint256 => string) exampleMapping;
        constructor() {
          exampleMapping[${MAPPING_KEY}] = "${EXAMPLE_STRING}";
        }
      }
    `,
  });
  const P = await T.prover();
  const { values, exitCode } = await P.prove(
    new DataRequest(1)
      .setTarget(C.target)
      .setSlot(0)
      .push(MAPPING_KEY)
      .follow()
      .readBytes()
      .setOutput(0)
  );
  expect(exitCode).toStrictEqual(0);
  expect(ethers.toUtf8String(values[0])).toStrictEqual(EXAMPLE_STRING);
});

test('get struct data AND nested mapped struct', async () => {
  const MAPPING_KEY = 'key'.repeat(32);
  const ROOT_STRING = 'root';
  const NEST_STRING = 'nest';
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
      contract C {
        struct Item {
          uint256 index;
          string name;
          mapping(bytes => Item) nested;
        }
        Item root;
        constructor() {
          root.index = 0;
          root.name = "${ROOT_STRING}";
          root.nested["${MAPPING_KEY}"].index = 1;
          root.nested["${MAPPING_KEY}"].name = "${NEST_STRING}";
        }
      }
    `,
  });
  const P = await T.prover();
  const { values, exitCode } = await P.prove(
    new DataRequest(2)
      .setTarget(C.target)
      .setSlot(0)
      .push(1)
      .addSlot()
      .readBytes()
      .setOutput(0)
      .push(1)
      .addSlot()
      .pushStr(MAPPING_KEY)
      .follow()
      .read()
      .setOutput(1)
  );
  expect(exitCode).toStrictEqual(0);
  expect(ethers.toUtf8String(values[0])).toStrictEqual(ROOT_STRING);
  expect(Number(values[1])).toStrictEqual(1);
});

test('read multiple adjacent slot values', async () => {
  const LENGTH_TO_USE = 5;
  const VALUES = Array.from({ length: LENGTH_TO_USE }, random32);
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
      contract C {
        ${VALUES.map((x, i) => `uint256 slot${i} = ${x};`).join('\n')}
      }
    `,
  });
  const P = await T.prover();
  const { values, exitCode } = await P.prove(
    new DataRequest(1).setTarget(C.target).read(LENGTH_TO_USE).setOutput(0)
  );
  expect(exitCode).toStrictEqual(0);
  expect(values[0]).toStrictEqual(ethers.concat(VALUES));
  expect(values[0].length).toStrictEqual(2 + LENGTH_TO_USE * 64);
});

test('bool[]', async () => {
  const VALUES = Array.from({ length: 37 }, () => Math.random() < 0.5);
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
      contract C {
        bool[] v = [${VALUES}];
      }
    `,
  });
  const P = await T.prover();
  const { values, exitCode } = await P.prove(
    new DataRequest(1).setTarget(C.target).readArray(1).setOutput(0)
  );
  expect(exitCode).toStrictEqual(0);
  expect(
    decodeStorageArray(1, values[0]).map((x) => !!parseInt(x))
  ).toStrictEqual(VALUES);
});

for (let N = 1; N <= 32; N <<= 1) {
  const W = N << 3;
  test(`uint${W}[]`, async () => {
    const VALUES = Array.from({ length: 17 }, (_, i) => ethers.toBeHex(i, N));
    const T = await setup();
    const C = await T.foundry.deploy({
      sol: `
        contract C {
          uint${W}[] v = [${VALUES.map((x) => `uint${W}(${N == 20 ? ethers.getAddress(x) : x})`)}]; // solc bug?
        }
      `,
    });
    const P = await T.prover();
    const { values, exitCode } = await P.prove(
      new DataRequest(1).setTarget(C.target).readArray(N).setOutput(0)
    );
    expect(exitCode).toStrictEqual(0);
    expect(decodeStorageArray(N, values[0])).toStrictEqual(VALUES);
  });
}

for (let N = 1; N <= 32; N <<= 1) {
  test(`bytes${N}[]`, async () => {
    const VALUES = Array.from({ length: Math.ceil(247 / N) }, (_, i) =>
      ethers.toBeHex(i, N)
    );
    const T = await setup();
    const C = await T.foundry.deploy({
      sol: `
        contract C {
          bytes${N}[] v = [${VALUES.map((x) => `bytes${N}(${N == 20 ? ethers.getAddress(x) : x})`)}]; // solc bug?
        }
      `,
    });
    const P = await T.prover();
    const { values, exitCode } = await P.prove(
      new DataRequest(1).setTarget(C.target).readArray(N).setOutput(0)
    );
    expect(exitCode).toStrictEqual(0);
    expect(decodeStorageArray(N, values[0])).toStrictEqual(VALUES);
  });
}
