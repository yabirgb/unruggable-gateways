/*
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
*/

import { PolygonPoSRollup } from '../../src/polygon/PolygonPoSRollup.js';
import { createProviderPair, providerURL } from '../providers.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip';
import { ABI_CODER } from '../../src/utils.js';
import { EVMRequest } from '../../src/vm.js';
import { Foundry } from '@adraffy/blocksmith';

const config = PolygonPoSRollup.mainnetConfig;
const rollup = new PolygonPoSRollup(createProviderPair(config), config);
// const rollup = new PolygonPoSRollup(
//   {
//     provider1: createProvider(config.chain1),
//     provider2: new ethers.JsonRpcProvider(
//       'https://polygon-bor-rpc.publicnode.com', //'https://polygon.gateway.tenderly.co/3NMXqhX4HdrJWxeZL8sg8r',
//       137,
//       { staticNetwork: true }
//     ),
//   },
//   config
// );

//rollup.provider2.on('debug', (x) => console.log(x));

const foundry = await Foundry.launch({
  fork: providerURL(config.chain1),
  infoLog: true,
});

const gateway = new Gateway(rollup);
const ccip = await serve(gateway, {
  protocol: 'raw',
  log: true,
});
const verifier = await foundry.deploy({
  file: 'PolygonPoSVerifier',
  args: [[ccip.endpoint], rollup.defaultWindow, rollup.RootChain],
});
await foundry.confirm(verifier.togglePoster(rollup.poster.address, true));

const req = new EVMRequest();
req.setTarget('0x35b4293d527964c017c072d80713CA1A3d2FD206');
req.read().addOutput();

// let prover = await EthProver.latest(rollup.provider2);
// console.log(parseInt(prover.block));
// prover = (await rollup.fetchLatestCommit()).prover;
// console.log(parseInt(prover.block));
// console.log(
//   await prover.getProofs('0x35b4293d527964c017c072d80713CA1A3d2FD206', [0n])
// );

// const latest = await rollup.fetchLatestCommitIndex();
// console.log(latest);
// const commit = await rollup.fetchCommit(latest);
// console.log(await rollup.fetchParentCommitIndex(commit));

const commit = await rollup.fetchLatestCommit();
console.log({
  header: commit.index,
  range: [commit.l2BlockNumberStart, commit.l2BlockNumberEnd],
  block: [BigInt(commit.prover.block)],
});

// const prover = new EthProver(rollup.provider2, '0x3a51747');

// console.log(
//   await prover.getProofs('0x35b4293d527964c017c072d80713ca1a3d2fd206', [0n])
// );
// throw 1;

const state = await commit.prover.evalRequest(req);
console.log(await state.resolveOutputs());

const proofSeq = await commit.prover.prove(state.needs);

console.log(
  await verifier.getStorageValues(
    ABI_CODER.encode(['uint256'], [commit.index]),
    req.toTuple(),
    rollup.encodeWitness(commit, proofSeq)
  )
);

ccip.http.close();
await foundry.shutdown();
