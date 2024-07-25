import { Foundry } from '@adraffy/blocksmith';
import { TaikoGateway } from '../../../src/gateway/TaikoGateway.js';
import {
  CHAIN_TAIKO,
  createProviderPair,
  providerURL,
} from '../../providers.js';

const gateway = TaikoGateway.mainnet({
  ...createProviderPair(CHAIN_TAIKO),
  blockDelay: 100, // TaikoGateway.mainnetConfig().commitStep = 64
});
const foundry = await Foundry.launch({
  fork: providerURL(1),
  infoLog: false,
});
const verifier = await foundry.deploy({
  file: 'TaikoVerifier',
  args: [[], gateway.TaikoL1, gateway.blockDelay, gateway.commitStep],
});

console.log(gateway.commitParams);

console.log(await gateway.fetchLatestCommitIndex(), 'fetchLatestCommitIndex');
console.log(await gateway.getLatestCommitIndex(), 'getLatestCommitIndex');
console.log(
  Number(await verifier.findDelayedBlockId(0)),
  'findDelayedBlockId(0)'
);
console.log(Number(await verifier.getLatestContext()), 'getLatestContext');

foundry.shutdown();
