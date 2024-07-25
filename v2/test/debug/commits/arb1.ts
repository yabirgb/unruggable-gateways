import { NitroGateway } from '../../../src/gateway/NitroGateway.js';
import {
  CHAIN_ARB1,
  createProviderPair,
  providerURL,
} from '../../providers.js';
import { Foundry } from '@adraffy/blocksmith';

const gateway = NitroGateway.arb1Mainnet({
  ...createProviderPair(CHAIN_ARB1),
  blockDelay: 350, // 300 blocks per hour
});
const foundry = await Foundry.launch({
  fork: providerURL(1),
  infoLog: false,
});
const verifier = await foundry.deploy({
  file: 'NitroVerifier',
  args: [[], gateway.L2Rollup, gateway.blockDelay],
});

console.log(gateway.commitParams);

console.log(await gateway.fetchLatestCommitIndex(), 'fetchLatestCommitIndex');
console.log(
  Number(await verifier.findDelayedNodeNum(0)),
  'findDelayedNodeNum(0)'
);
console.log(await gateway.fetchDelayedCommitIndex(), 'fetchDelayedCommitIndex');
console.log(Number(await verifier.getLatestContext()), 'getLatestContext');

foundry.shutdown();
