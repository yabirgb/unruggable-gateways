import { Foundry } from '@adraffy/blocksmith';
import { toPaddedHex } from '../src/utils.js';

const foundry = await Foundry.launch({ infoLog: false });

const report: Record<string, bigint> = {};
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
  args: [[], 0, A, [A, A, 0, 0]],
  libs: { GatewayVM },
});
await foundry.deploy({
  file: 'ReverseOPVerifier',
  args: [[], 0, A, A],
  libs: { GatewayVM },
});

await foundry.shutdown();

console.log(new Date());
console.log(report);

// 2024-10-07T00:05:55.095Z
// {
//   GatewayVM: 1879334n,
//   EthVerifierHooks: 1295526n,
//   ScrollVerifierHooks: 555817n,
//   ZKSyncVerifierHooks: 325104n,
//   LineaVerifierHooks: 819513n,
//   OPVerifier: 1045507n,
//   OPFaultVerifier: 1216547n,
//   ReverseOPVerifier: 1473514n,
// }
