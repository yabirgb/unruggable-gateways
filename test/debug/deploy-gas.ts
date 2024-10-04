import { Foundry } from '@adraffy/blocksmith';
import { toPaddedHex } from '../../src/utils.js'; 

const foundry = await Foundry.launch({ infoLog: false });

const report = {};
foundry.on('deploy', (c) => (report[c.__info.contract] = c.__receipt.gasUsed));

const A = toPaddedHex(1, 20);

// machine
const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });

// hooks
await foundry.deploy({ file: 'EthVerifierHooks' });
await foundry.deploy({ file: 'ScrollVerifierHooks', args: [A] });
await foundry.deploy({ file: 'ZKSyncVerifierHooks', args: [A] });
await foundry.deploy({
  file: 'LineaVerifierHooks',
  libs: { SparseMerkleProof: A },
});

// few examples
await foundry.deploy({
  file: 'OPVerifier',
  args: [[], 0, A, A],
  libs: { GatewayVM },
});
await foundry.deploy({
  file: 'OPFaultVerifier',
  args: [[], 0, A, A, A, 0],
  libs: { GatewayVM },
});
await foundry.deploy({
  file: 'OPReverseVerifier',
  args: [[], 0, A, A],
  libs: { GatewayVM },
});

await foundry.shutdown();

console.log(new Date());
console.log(report);

// 2024-10-04T02:04:50.033Z
// {
//   GatewayVM: 1961570n,
//   EthVerifierHooks: 1295526n,
//   ScrollVerifierHooks: 555817n,
//   ZKSyncVerifierHooks: 325104n,
//   LineaVerifierHooks: 819513n,
//   OPVerifier: 1089151n,
//   OPFaultVerifier: 1309289n,
//   OPReverseVerifier: 1517097n,
// }
