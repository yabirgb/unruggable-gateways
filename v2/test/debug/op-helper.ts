import { OPFaultHelper } from '../../src/op/helper.js';
import { OPFaultGateway } from '../../src/op/OPFaultGateway.js';
import { createProvider } from '../providers.js';
import { ethers } from 'ethers';
import { HELPER_ABI } from '../../src/op/types.js';

const config = OPFaultGateway.mainnetConfig;
const provider = createProvider(config.chain1);
const helper = new ethers.Contract(config.OPFaultHelper, HELPER_ABI, provider);
const helper_js = await OPFaultHelper.fromPortal(
  provider,
  config.OptimismPortal
);

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
