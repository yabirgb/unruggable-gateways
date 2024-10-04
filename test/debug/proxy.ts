import { Contract, ZeroAddress } from 'ethers';
import { Foundry } from '@adraffy/blocksmith';

// export async function deployProxy(foundry: Foundry, verifier: Contract) {
//   const wallet = foundry.wallets.admin;
//   const proxy = await foundry.deploy({
//     import:
//       '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol',
//     args: [verifier, wallet, '0x'],
//   });
//   return new Contract(proxy.target, verifier.interface, wallet);
// }

const foundry = await Foundry.launch();

const ownerWallet = await foundry.ensureWallet('owner');

const impl = await foundry.deploy({
  file: 'OPFaultVerifier',
  args: [ZeroAddress],
});

const proxy = await foundry.deploy({
  import: '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol',
  args: [impl, ownerWallet, '0x'],
});

const verifier = new Contract(proxy, impl.interface, ownerWallet);

console.log(await verifier.owner());
console.log(ownerWallet.address);

await foundry.confirm(verifier.setGatewayURLs(['chonk.com']));
console.log(await verifier.gatewayURLs());

await foundry.confirm(verifier.setWindow(69420));
console.log(await verifier.getWindow());

await foundry.shutdown();
