import { OPFaultGameFinder, OPFaultGameFinder } from '../../src/op/helper.js';
import { OPFaultGateway } from '../../src/op/OPFaultGateway.js';
import { createProvider, createProviderPair } from '../providers.js';
import { ethers } from 'ethers';
import { HELPER_ABI } from '../../src/op/types.js';

const config = OPFaultGateway.mainnetConfig;
//const helper = new ethers.Contract(config.OPFaultHelper, HELPER_ABI, provider);
const gateway = new OPFaultGateway({
  ...createProviderPair(config),
  ...config,
});

const { gameFinder } = await gateway.onchainConfig.get();

// let calls = 0;
// gateway.provider1.on('debug', (e) => {
//   if (e.action === 'sendRpcPayload') {
//     calls++;
//     console.log(e.payload.method, e.payload.params);
//   }
// });

console.log(await gameFinder.latestGames());
console.log(await gameFinder.latestGames());

/*
for (let i = 0; i < 10; i++) {
  const blockDelay = 100 * i;
  const delaySec = blockDelay * 12;
  const [sol, gas, js] = await Promise.all([
    helper.findDelayedGameIndex(config.OptimismPortal, delaySec),
    helper.findDelayedGameIndex.estimateGas(config.OptimismPortal, delaySec),
    helper_js.fetchDelayedGameIndex(blockDelay),
  ]);
  console.log(blockDelay, sol, js, sol === js, gas);
}
*/
