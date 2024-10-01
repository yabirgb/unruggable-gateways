import { Foundry } from '@adraffy/blocksmith';
import { ZeroAddress } from 'ethers/constants';

const foundry = await Foundry.launch();

// machine
const GatewayProver = await foundry.deploy({ file: 'GatewayProver' });

console.log(GatewayProver);

// hooks
await foundry.deploy({ file: 'EthTrieHooks' });
await foundry.deploy({ file: 'ScrollTrieHooks', args: [ZeroAddress] });
await foundry.deploy({ file: 'ZKSyncTrieHooks', args: [ZeroAddress] });
await foundry.deploy({
  file: 'LineaTrieHooks',
  libs: { SparseMerkleProof: ZeroAddress },
});

// few examples
await foundry.deploy({
  file: 'OPVerifier',
  args: [[], 0, ZeroAddress, ZeroAddress],
  libs: { GatewayProver },
});
await foundry.deploy({
  file: 'OPFaultVerifier',
  args: [[], 0, ZeroAddress, ZeroAddress, ZeroAddress, 0],
  libs: { GatewayProver },
});
await foundry.deploy({
  file: 'OPReverseVerifier',
  args: [[], 0, ZeroAddress, ZeroAddress],
  libs: { GatewayProver },
});

await foundry.shutdown();
