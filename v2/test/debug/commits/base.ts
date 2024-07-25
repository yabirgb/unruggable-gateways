import { OPGateway } from '../../../src/gateway/OPGateway.js';
import {
  CHAIN_BASE,
  createProviderPair,
  providerURL,
} from '../../providers.js';
import { Foundry } from '@adraffy/blocksmith';

const gateway = OPGateway.baseMainnet({
  ...createProviderPair(CHAIN_BASE),
  blockDelay: 350, // 300 blocks per hour
});
const foundry = await Foundry.launch({
  fork: providerURL(1),
  infoLog: false,
});
const verifier = await foundry.deploy({
  file: 'OPVerifier',
  args: [[], gateway.L2OutputOracle, gateway.blockDelay],
});

console.log(gateway.commitParams);

console.log(await gateway.fetchLatestCommitIndex(), 'fetchLatestCommitIndex');
console.log(
  Number(await verifier.findDelayedOutputIndex(0)),
  'findDelayedOutputIndex(0)'
);

console.log(await gateway.fetchDelayedCommitIndex(), 'fetchDelayedCommitIndex');
console.log(Number(await verifier.getLatestContext()), 'getLatestContext');

foundry.shutdown();
