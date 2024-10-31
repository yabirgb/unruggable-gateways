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
  args: [[], 0, A, A, 0],
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
await foundry.deploy({
  file: 'TrustedVerifier',
  libs: { GatewayVM },
});

await foundry.shutdown();

console.log(new Date());
console.log(report);

// 2024-10-29T20:39:17.608Z
// {
//  GatewayVM: 1875116n,
//  EthVerifierHooks: 1280832n,
//  ScrollVerifierHooks: 550613n,
//  ZKSyncVerifierHooks: 323789n,
//  LineaVerifierHooks: 817863n,
//  OPVerifier: 1131805n,
//  OPFaultVerifier: 1247548n,
//  ReverseOPVerifier: 1486827n,
//  TrustedVerifier: 1232904n,
// }
