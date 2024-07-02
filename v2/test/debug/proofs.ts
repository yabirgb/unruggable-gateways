import {EVMProver} from '../../src/vm.js';
import {createProvider} from '../../src/providers.js';

let prover = await EVMProver.latest(createProvider(1));

let A = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';


//console.log(await prover.isContract(A));

//console.log(await prover.getStorage(A, 1n));

await prover.getProofs(A, [1n, 2n]);

//prover.provider.on('debug', e => console.log(e));

let p1 = prover.getProofs(A, [2n, 3n]);
let p2 = prover.getProofs(A, [3n, 4n]);
let p3 = prover.getProofs(A, [1n, 4n]);
await Promise.all([p1, p2, p3]);

console.log(await prover.cachedMap());

//let p0 = await prover.fetchProofs2(A, [1n, 2n]);
//let p1 = await prover.fetchProofs(A, [1n, 2n]);

//console.log(Bun.deepEquals(p0, p1));

//console.log(await prover.isContract(A));
//console.log(await prover.isContract('0x51050ec063d393217B436747617aD1C2285Aeeee'));

//console.log(await prover.fetchProofs(A, [1n]));