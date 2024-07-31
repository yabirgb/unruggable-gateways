import { FinalizedOPFaultGateway } from '../../../src/gateway/OPFaultGateway.js';
import { CHAIN_OP, createProviderPair, providerURL } from '../../providers.js';
import { Foundry } from '@adraffy/blocksmith';

const gateway = FinalizedOPFaultGateway.mainnet({
  ...createProviderPair(CHAIN_OP),
  blockDelay: 350, // 300 blocks per hour
});
const foundry = await Foundry.launch({
  fork: providerURL(1),
  infoLog: false,
});
const verifier = await foundry.deploy({
  file: 'FinalizedOPFaultVerifier',
  args: [[], gateway.OptimismPortal, gateway.blockDelay],
});

console.log(gateway.commitParams);

console.log(await gateway.fetchLatestCommitIndex(), 'fetchLatestCommitIndex');
console.log(
  Number(await verifier.findDelayedGameIndex(0)),
  'findDelayedGameIndex(0)'
);

console.log(await gateway.fetchDelayedCommitIndex(), 'fetchDelayedCommitIndex');
console.log(Number(await verifier.getLatestContext()), 'getLatestContext');

foundry.shutdown();
