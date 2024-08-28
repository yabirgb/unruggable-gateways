import { CHAIN_POLYGON_POS } from '../../src/chains';
import { EthProver } from '../../src/eth/EthProver';
import { createProvider, providerURL } from '../providers';
import { proveAccountState, proveStorageValue } from '../../src/eth/merkle.ts';

const provider = createProvider(CHAIN_POLYGON_POS);
console.log(providerURL(CHAIN_POLYGON_POS));

const prover = await EthProver.latest(provider);

const stateRoot = await prover.fetchStateRoot();

const A = '0x35b4293d527964c017c072d80713CA1A3d2FD206';

const proofs = await prover.getProofs(A, [0n]);

//const encoded = await prover.prove([[A, true]]);
//console.log(encoded);
//console.log(await verifier.proveAccountState(stateRoot, A, encoded.proofs[0]));

console.log(proofs.accountProof);

const accountState = proveAccountState(A, proofs.accountProof, stateRoot);
console.log(accountState);
console.log(
  proveStorageValue(0n, proofs.storageProof[0].proof, accountState!.storageRoot)
);
