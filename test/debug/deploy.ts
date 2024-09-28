import { Foundry } from '@adraffy/blocksmith';
import { ethers } from 'ethers';

const foundry = await Foundry.launch({
  infoLog: true,
});

// await foundry.deploy({
//   sol: `
//     import "@src/GatewayProver.sol";
//     contract Prover {
//       function f() external returns (bytes[] memory, uint8) {
//         GatewayRequest memory r;
//         ProofSequence memory s;
//         return GatewayProver.evalRequest(r, s);
//       }
//     }
//   `,
// });

await foundry.deploy({
  file: 'EthSelfVerifier',
});
await foundry.deploy({
  file: 'OPVerifier',
});
await foundry.deploy({
  file: 'OPFaultVerifier',
  args: [ethers.ZeroAddress],
});
await foundry.deploy({
  file: 'LineaVerifier',
  libs: { SparseMerkleProof: ethers.ZeroAddress },
});
await foundry.deploy({
  file: 'NitroVerifier',
});
await foundry.deploy({
  file: 'ScrollVerifier',
});
await foundry.deploy({
  file: 'TaikoVerifier',
});
await foundry.deploy({
  file: 'ZKSyncVerifier',
  args: [ethers.ZeroAddress]
});

foundry.shutdown();
