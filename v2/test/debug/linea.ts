import { CHAIN_LINEA, CHAIN_MAINNET } from '../../src/chains.js';
import { LineaProver } from '../../src/linea/LineaProver.js';
import { createProvider, createProviderPair } from '../providers.js';
import { LineaGateway } from '../../src/linea/LineaGateway.js';
import { proveAccountState, proveStorageValue } from '../../src/evm/merkle.js';
import { ethers } from 'ethers';

const provider1 = createProvider(CHAIN_MAINNET);
const provider2 = createProvider(CHAIN_LINEA);

const prover = new LineaProver(
  provider2,
  await LineaGateway.latestBlock(
    provider1,
    LineaGateway.mainnetConfig.L1MessageService
  )
);

console.log('[account: dne]');
console.log(
  JSON.stringify(
    await prover.getProofs('0x0000000000000000000000000000000000001234', [0n]),
    null,
    '\t'
  )
);
console.log();
console.log('[account: eoa]');
console.log(
  JSON.stringify(
    await prover.getProofs('0x51050ec063d393217B436747617aD1C2285Aeeee', [0n]),
    null,
    '\t'
  )
);
console.log();
console.log('[account: contract]');
console.log(
  JSON.stringify(
    await prover.getProofs('0xa53cca02f98d590819141aa85c891e2af713c223', [0n]),
    null,
    '\t'
  )
);
console.log();

console.log(prover.storageMap());

// const config = LineaGateway.mainnetConfig;
// const gateway = new LineaGateway({
//   ...createProviderPair(config),
//   ...config,
// });

//const block = `0x${(8004348).toString(16)}`;

//const prover = await EVMProver.latest(provider);
// const prover = new EVMProver(provider, block);

// const proof = await prover.getProofs(
//   '0xa53cca02f98d590819141aa85c891e2af713c223',
//   [0n] // owner
// );

// const stateRoot = await prover.fetchStateRoot();
// console.log(stateRoot);

// console.log(await gateway.L1MessageService.stateRootHashes(block));

// const accountState = proveAccountState(
//   proof.address,
//   proof.accountProof,
//   stateRoot
// );
// console.log(accountState);

// const storageProof = proof.storageProof[0];
// console.log(
//   proveStorageValue(
//     storageProof.key,
//     storageProof.proof,
//     accountState!.storageRoot
//   )
// );
//const A = '0xa53cca02f98d590819141aa85c891e2af713c223';
//const A = '0x51050ec063d393217B436747617aD1C2285Aeeee';
// const A = '0x0000000000000000000000000000000000001234';
// console.log(
//   JSON.stringify(
//     await provider.send('linea_getProof', [A, [ethers.toBeHex(0, 32)], block]),
//     null,
//     '\t'
//   )
// );

// const code = await provider.getCode(A);
// console.log(ethers.keccak256(code));
