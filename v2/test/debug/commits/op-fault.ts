import { OPFaultGateway } from '../../../src/op-fault/gateway.js';
import { createProviderPair, providerURL } from '../../providers.js';
import { Foundry } from '@adraffy/blocksmith';

const config = OPFaultGateway.mainnetConfig;
const gateway = new OPFaultGateway({
  ...createProviderPair(config),
  ...config,
  blockDelay: 350, // 300 blocks per hour
});
const foundry = await Foundry.launch({
  fork: providerURL(config.chain1),
  infoLog: true,
  procLog: true,
});
// const verifier = await foundry.deploy({
//   file: 'OPFaultVerifier',
//   args: [
//     [],
//     gateway.effectiveCommitDelay,
//     gateway.OptimismPortal,
//     gateway.OPFaultHelper,
//   ],
// });

console.log(gateway.commitParams);

console.log({
  fetchLatestCommitIndex: await gateway.fetchLatestCommitIndex(),
  fetchDelayedCommitIndex: await gateway.fetchDelayedCommitIndex(),
  // this is too slow when called through the fork
  //getLatestContext: parseInt(await verifier.getLatestContext()),
});

foundry.shutdown();
