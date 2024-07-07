import type { HexString } from '../../../src/types.js';
import { ethers } from 'ethers';
import { Foundry } from '@adraffy/blocksmith';
import { EVMProver, EVMRequest } from '../../../src/vm.js';
import { decodeStorageArray } from '../../utils.js';
import { test, afterAll, expect } from 'bun:test';

//Helper function to generate a random 32 byte hex string
function random32(): HexString {
  return ethers.hexlify(ethers.randomBytes(32));
}

//Setup for initalizing Foundy, deploying our basic verifier contract (to test against), and creating a prover function to interface with the verifier
async function setup() {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(() => foundry.shutdown());
  const verifier = await foundry.deploy({
    sol: `
    import {EVMProver, ProofSequence} from "@ensdomains/evmgateway/contracts/EVMProver.sol";
    import {MerkleTrieHelper} from "@ensdomains/evmgateway/contracts/MerkleTrieHelper.sol";
    import {EVMRequest} from "@ensdomains/evmgateway/contracts/EVMProtocol.sol";

		contract Verifier {
			function getStorageValues(
        EVMRequest memory r,
        bytes32 stateRoot,
				bytes[][] memory proofs,
	      bytes memory order

			) external view returns (bytes[] memory, uint8 exitCode) {
				
        return EVMProver.evalRequest(
          r,
          ProofSequence(
            0,
            stateRoot,
            proofs,
            order,
            MerkleTrieHelper.proveAccountState,
            MerkleTrieHelper.proveStorageValue
          )
        );
			}
		}
	`,
  });
  return {
    foundry,
    verifier,
    async prover() {
      const prover = await EVMProver.latest(this.foundry.provider);
      const stateRoot = await prover.fetchStateRoot();

      return {
        prover,
        stateRoot,
        async prove(r: EVMRequest): Promise<HexString[]> {
          const outputs = await r.resolveWith(prover);

          console.log('Outputs: ', outputs);

          const vm = await this.prover.evalRequest(r);

          const { proofs, order } = await this.prover.prove(vm.needs);

          console.log('ops', r.ops);
          console.log('inputs', r.inputs);

          return verifier.getStorageValues(
            [Uint8Array.from(r.ops), r.inputs],
            stateRoot,
            proofs,
            order
          );
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
		contract X {
			uint256 slot0 = ${VALUE};
		}
	`,
  });

  const OUTPUT_COUNT = 1;

  const P = await T.prover();
  //Build a request using our Typescript API
  const [values, exitCode] = await P.prove(
    new EVMRequest(OUTPUT_COUNT)
      .setTarget(C.target)
      .setSlot(0)
      .read()
      .setOutput(0)
  );

  console.log('Values: ', values);

  expect(values).toHaveLength(1);
  expect(values[0]).toStrictEqual(VALUE);
  expect(exitCode).toStrictEqual(0n);
});

test('get random values from random slots', async () => {
  const LENGTH_TO_USE = 5;
  const XY = Array.from({ length: LENGTH_TO_USE }, () => {
    return [random32(), random32()];
  });
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
		contract X {
			constructor() {
				assembly {
					${XY.map(([x, y]) => `sstore(${x}, ${y})`).join('\n')}
				}
			}
		}
	`,
  });
  const P = await T.prover();
  const r = new EVMRequest(LENGTH_TO_USE).setTarget(C.target);

  XY.forEach(([x], i) => r.setSlot(x).read().setOutput(i));

  const [values, exitCode] = await P.prove(r);
  expect(values).toHaveLength(XY.length);

  XY.forEach(([, y], i) => expect(values[i]).toStrictEqual(y));

  expect(exitCode).toStrictEqual(0n);
});

test('get small and long string', async () => {
  const SMALL = 'chonk';
  const LARGE = SMALL.repeat(13);
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
		contract X {
			string small = "${SMALL}";
			string large = "${LARGE}";
		}
	`,
  });

  const OUTPUT_COUNT = 2;

  const P = await T.prover();
  const [values, exitCode] = await P.prove(
    new EVMRequest(OUTPUT_COUNT)
      .setTarget(C.target)
      .readBytes()
      .setOutput(0)
      .setSlot(1)
      .readBytes()
      .setOutput(1)
  );
  expect(values).toHaveLength(2);
  expect(ethers.toUtf8String(values[0])).toStrictEqual(SMALL);
  expect(ethers.toUtf8String(values[1])).toStrictEqual(LARGE);
  expect(exitCode).toStrictEqual(0n);
});

test('get small string from mapping', async () => {
  const EXAMPLE_STRING = 'chonk';
  const MAPPING_KEY = 42;
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
		contract X {
				mapping(uint256=>string) exampleMapping;          

        constructor() {
          exampleMapping[${MAPPING_KEY}] = "${EXAMPLE_STRING}";
        }
		}
	`,
  });

  const OUTPUT_COUNT = 1;

  const P = await T.prover();
  const [values, exitCode] = await P.prove(
    new EVMRequest(OUTPUT_COUNT)
      .setTarget(C.target)
      .setSlot(0)
      .push(MAPPING_KEY)
      .follow()
      .readBytes()
      .setOutput(0)
  );
  expect(values).toHaveLength(1);
  expect(ethers.toUtf8String(values[0])).toStrictEqual(EXAMPLE_STRING);
  expect(exitCode).toStrictEqual(0n);
});

test('get long string from mapping', async () => {
  const SMALL = 'chonk';
  const EXAMPLE_STRING = SMALL.repeat(13);
  const MAPPING_KEY = 42;
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
		contract X {
				mapping(uint256=>string) exampleMapping;          

        constructor() {
          exampleMapping[${MAPPING_KEY}] = "${EXAMPLE_STRING}";
        }
		}
	`,
  });

  const OUTPUT_COUNT = 1;

  const P = await T.prover();
  const [values, exitCode] = await P.prove(
    new EVMRequest(OUTPUT_COUNT)
      .setTarget(C.target)
      .setSlot(0)
      .push(MAPPING_KEY)
      .follow()
      .readBytes()
      .setOutput(0)
  );
  expect(values).toHaveLength(1);
  expect(ethers.toUtf8String(values[0])).toStrictEqual(EXAMPLE_STRING);
  expect(exitCode).toStrictEqual(0n);
});

test('get struct data AND nested mapped struct', async () => {
  const MAPPING_KEY = 'key'.repeat(32);
  const ROOT_STRING = 'root';
  const NEST_STRING = 'nest';
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
		contract X {
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

  const OUTPUT_COUNT = 2;

  const P = await T.prover();
  const [values, exitCode] = await P.prove(
    new EVMRequest(OUTPUT_COUNT)
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
  expect(values).toHaveLength(OUTPUT_COUNT);
  expect(ethers.toUtf8String(values[0])).toStrictEqual(ROOT_STRING);
  expect(Number(values[1])).toStrictEqual(1);
  expect(exitCode).toStrictEqual(0n);
});

test('read multiple adjacent slot values', async () => {
  const LENGTH_TO_USE = 5;
  const VALUES = Array.from({ length: LENGTH_TO_USE }, random32);
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
		contract X {
			${VALUES.map((x, i) => `uint256 slot${i} = ${x};`).join('\n')}
		}
	`,
  });

  const OUTPUT_COUNT = 1;

  const P = await T.prover();
  const [values, exitCode] = await P.prove(
    new EVMRequest(OUTPUT_COUNT)
      .setTarget(C.target)
      .read(LENGTH_TO_USE)
      .setOutput(0)
  );
  expect(values).toHaveLength(OUTPUT_COUNT);
  expect(values[0]).toStrictEqual(ethers.concat(VALUES));
  expect(values[0].length).toStrictEqual(2 + LENGTH_TO_USE * 64);
  expect(exitCode).toStrictEqual(0n);
});

test('bool[]', async () => {
  const VALUES = Array.from({ length: 37 }, () => Math.random() < 0.5);
  const T = await setup();
  const C = await T.foundry.deploy({
    sol: `
		contract X {
			bool[] v = [${VALUES}];
		}
	`,
  });
  const OUTPUT_COUNT = 1;

  const P = await T.prover();
  const [values, exitCode] = await P.prove(
    new EVMRequest(OUTPUT_COUNT).setTarget(C.target).readArray(1).setOutput(0)
  );

  expect(values).toHaveLength(OUTPUT_COUNT);
  expect(
    decodeStorageArray(1, values[0]).map((x) => !!parseInt(x))
  ).toStrictEqual(VALUES);
  expect(exitCode).toStrictEqual(0n);
});

for (let N = 1; N <= 32; N++) {
  //for (let N of [19, 20, 21]) {
  const W = N << 3;
  test(`uint${W}[]`, async () => {
    const VALUES = Array.from({ length: 17 }, (_, i) => ethers.toBeHex(i, N));
    const T = await setup();
    const C = await T.foundry.deploy({
      sol: `
			contract X {
				uint${W}[] v = [${VALUES.map((x) => `uint${W}(${N == 20 ? ethers.getAddress(x) : x})`)}]; // solc bug?
			}
		`,
    });

    const OUTPUT_COUNT = 1;

    const P = await T.prover();
    const [values, exitCode] = await P.prove(
      new EVMRequest(OUTPUT_COUNT).setTarget(C.target).readArray(N).setOutput(0)
    );
    expect(values).toHaveLength(OUTPUT_COUNT);
    expect(decodeStorageArray(N, values[0])).toStrictEqual(VALUES);
    expect(exitCode).toStrictEqual(0n);
  });
}

for (let N = 1; N <= 32; N++) {
  //for (let N of [19, 20, 21]) {
  test(`bytes${N}[]`, async () => {
    const VALUES = Array.from({ length: Math.ceil(247 / N) }, (_, i) =>
      ethers.toBeHex(i, N)
    );
    const T = await setup();
    const C = await T.foundry.deploy({
      sol: `
			contract X {
				bytes${N}[] v = [${VALUES.map((x) => `bytes${N}(${N == 20 ? ethers.getAddress(x) : x})`)}]; // solc bug?
			}
		`,
    });

    const OUTPUT_COUNT = 1;

    const P = await T.prover();
    const [values, exitCode] = await P.prove(
      new EVMRequest(OUTPUT_COUNT).setTarget(C.target).readArray(N).setOutput(0)
    );
    expect(values).toHaveLength(OUTPUT_COUNT);
    expect(decodeStorageArray(N, values[0])).toStrictEqual(VALUES);
    expect(exitCode).toStrictEqual(0n);
  });
}
