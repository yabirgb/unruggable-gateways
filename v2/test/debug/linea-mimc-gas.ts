//import { Foundry } from '@adraffy/blocksmith';
import { createProvider } from '../providers';
import { CHAIN_MAINNET } from '../../src/chains';
import { ethers } from 'ethers';

// const foundry = await Foundry.launch();

// const mimc = await foundry.deploy({
//   sol: `
//     import {Mimc} from "@src/linea/Mimc.sol";
//     contract XYZ {
//       function hash(bytes calldata v) external pure returns (bytes32) {
//         return Mimc.hash(v);
//       }
//     }
//   `,
// });

const provider = createProvider(CHAIN_MAINNET);

// https://etherscan.io/address/0xBf8C454Af2f08fDD90bB7B029b0C2c07c2a7b4A3#code SparseMerkleProof
// https://etherscan.io/address/0xD19FC235f411732fB7cd619505eFf3cB646774a3#code Mimc
const contract = new ethers.Contract(
  '0xd19fc235f411732fb7cd619505eff3cb646774a3',
  [`function hash(bytes calldata v) view returns (bytes32)`],
  provider
);

console.log(await contract.hash(ethers.ZeroHash));
console.log(await contract.hash(ethers.id('')));

throw 1;

for (let i = 0; i <= 8; i++) {
  const n = i << 5;
  console.log(n, await contract.hash.estimateGas(ethers.randomBytes(n)));
}

// 32 29079n
// 64 36091n
// 96 43127n
// 128 50126n
// 160 57579n
// 192 64617n
// 224 71631n
// 256 78669n
