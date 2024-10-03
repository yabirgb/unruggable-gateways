import { Foundry } from '@adraffy/blocksmith';
import { ZeroAddress } from 'ethers/constants';

const foundry = await Foundry.launch({ infoLog: false });

const report = {};
foundry.on('deploy', (c) => (report[c.__info.contract] = c.__receipt.gasUsed));

// machine
const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });

// hooks
await foundry.deploy({ file: 'EthVerifierHooks' });
await foundry.deploy({ file: 'ScrollVerifierHooks', args: [ZeroAddress] });
await foundry.deploy({ file: 'ZKSyncVerifierHooks', args: [ZeroAddress] });
await foundry.deploy({
  file: 'LineaVerifierHooks',
  libs: { SparseMerkleProof: ZeroAddress },
});

// few examples
await foundry.deploy({
  file: 'OPVerifier',
  args: [[], 0, ZeroAddress, ZeroAddress],
  libs: { GatewayVM },
});
await foundry.deploy({
  file: 'OPFaultVerifier',
  args: [[], 0, ZeroAddress, ZeroAddress, ZeroAddress, 0],
  libs: { GatewayVM },
});
await foundry.deploy({
  file: 'OPReverseVerifier',
  args: [[], 0, ZeroAddress, ZeroAddress],
  libs: { GatewayVM },
});

await foundry.shutdown();

console.log(new Date());
console.log(report);

// 2024-10-03T03:14:41.399Z
// {
//   GatewayVM: 1961594n,
//   EthVerifierHooks: 1295526n,
//   ScrollVerifierHooks: 555793n,
//   ZKSyncVerifierHooks: 325080n,
//   LineaVerifierHooks: 819369n,
//   OPVerifier: 1089139n,
//   OPFaultVerifier: 1309253n,
//   OPReverseVerifier: 1510458n,
// }
