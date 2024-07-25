import { Foundry } from '@adraffy/blocksmith';
import { ScrollGateway } from '../../../src/gateway/ScrollGateway.js';
import {
  CHAIN_SCROLL,
  createProviderPair,
  providerURL,
} from '../../providers.js';

const gateway = ScrollGateway.mainnet({
  ...createProviderPair(CHAIN_SCROLL),
  blockDelay: 100,
});
const foundry = await Foundry.launch({
  fork: providerURL(1),
  infoLog: false,
});
const verifier = await foundry.deploy({
  file: 'ScrollVerifier',
  args: [
    [],
    gateway.ScrollChainCommitmentVerifier,
    gateway.effectiveCommitDelay,
    gateway.commitStep,
  ],
});

console.log(gateway.commitParams);

console.log(await gateway.fetchLatestCommitIndex(), 'fetchLatestCommitIndex');
console.log(await gateway.fetchDelayedCommitIndex(), 'fetchDelayedCommitIndex');
console.log(await gateway.getLatestCommitIndex(), 'getLatestCommitIndex');
console.log(await gateway.getDelayedCommitIndex(), 'getDelayedCommitIndex');
console.log(Number(await verifier.getLatestContext()), 'getLatestContext');
console.log(
  Number(await verifier.findDelayedBatchIndex(0)),
  'findDelayedBatchIndex(0)'
);

foundry.shutdown();
