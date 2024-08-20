import { ethers } from 'ethers';
import {
  Foundry,
  type WalletLike,
  type DeployedContract,
} from '@adraffy/blocksmith';
import { EVMRequest } from '../../../src/vm.js';
import { EthProver } from '../../../src/eth/EthProver.js';
import { HexString } from '../../../src/types.js';

const foundry = await Foundry.launch({ infoLog: true, procLog: false });

const SUBDOMAIN_ISSUER_ROLE = ethers.id('SUBDOMAIN_ISSUER_ROLE');
const REGISTRAR_ROLE = ethers.id('REGISTRAR_ROLE');

async function deployResolver(owner: WalletLike) {
  return foundry.deploy({
    import: '@ensdomains/ens-contracts/contracts/resolvers/OwnedResolver.sol',
    from: owner,
  });
}

const adminWallet = foundry.requireWallet('admin');
const raffyWallet = await foundry.ensureWallet('raffy');

const datastore = await foundry.deploy({
  import: '@ensdomains/enschain/contracts/src/registry/RegistryDatastore.sol',
  from: adminWallet,
});

const rootRegistry = await foundry.deploy({
  import: '@ensdomains/enschain/contracts/src/registry/RootRegistry.sol',
  args: [datastore],
  from: adminWallet,
});

const ethRegistry = await foundry.deploy({
  //import: '@ensdomains/enschain/contracts/src/registry/ETHRegistry.sol',
  sol: `
    import {IRegistryDatastore} from "@ensdomains/enschain/contracts/src/registry/IRegistryDatastore.sol";
    import {ETHRegistry} from "@ensdomains/enschain/contracts/src/registry/ETHRegistry.sol";
    contract ETHRegistryExt is ETHRegistry {
      constructor(IRegistryDatastore _datastore) ETHRegistry(_datastore) {
      }
      function setResolver(uint256 tokenId, address resolver, uint96 flags) external {
        datastore.setResolver(tokenId, resolver, flags);
      }
    }
  `,
  args: [datastore],
  from: adminWallet,
});
async function registerEth(
  label: string,
  {
    expiry = BigInt(Math.floor(Date.now() / 1000) + 1000000),
    owner,
    subregistry = ethers.ZeroAddress,
    locked = false,
  }: {
    expiry?: bigint;
    owner: WalletLike;
    subregistry?: HexString | DeployedContract;
    locked?: boolean;
  }
) {
  let flags = expiry;
  if (locked) flags |= 0x100000000n;
  return foundry.confirm(
    ethRegistry.register(label, owner, subregistry, flags)
  );
}

async function deployUserRegistry(
  parentRegistry: DeployedContract,
  label: string,
  owner: WalletLike
) {
  return foundry.deploy({
    import: '@ensdomains/enschain/contracts/src/registry/UserRegistry.sol',
    args: [parentRegistry, label, datastore],
    from: owner,
  });
}

await foundry.confirm(
  rootRegistry.grantRole(SUBDOMAIN_ISSUER_ROLE, adminWallet)
);
await foundry.confirm(ethRegistry.grantRole(REGISTRAR_ROLE, adminWallet));

await foundry.confirm(rootRegistry.mint('eth', adminWallet, ethRegistry, true));

const raffyRegistry = await deployUserRegistry(
  ethRegistry,
  'raffy',
  raffyWallet
);
const raffyResolver = await deployResolver(raffyWallet);

await registerEth('raffy', { owner: raffyWallet, subregistry: raffyRegistry });

await foundry.confirm(
  raffyRegistry.mint('chonk', raffyWallet, ethers.ZeroAddress, 0)
);

await foundry.confirm(
  ethRegistry.setResolver(ethers.id('raffy'), raffyResolver, 0)
);

await foundry.confirm(
  raffyResolver.setText(ethers.namehash('raffy.eth'), 'name', 'Raffy')
);
await foundry.confirm(
  raffyResolver.setText(ethers.namehash('chonk.raffy.eth'), 'name', 'Chonk')
);

const prover = await EthProver.latest(foundry.provider);

// 0: mapping(address registry => mapping(uint256 tokenId => uint256)) internal subregistries;
// 1: mapping(address registry => mapping(uint256 tokenId => uint256)) internal resolvers;

async function resolve(name: string) {
  console.log();
  const req = new EVMRequest(3);
  const iNode = req.addInput(ethers.namehash(name));
  req.setTarget(datastore.target); // use storage contract
  req.push(rootRegistry.target).setOutput(0); // start at root
  name.split('.').forEach((x) => req.push(ethers.id(x))); // tokenIds
  req
    .begin()
    .dup() // duplicate tokenId
    .begin()
    .setSlot(1)
    .pushOutput(0)
    .follow()
    .follow()
    .read() // resolvers[registry][tokenId]
    .requireNonzero()
    .setOutput(1) // save nonzero resolver
    .end()
    .eval({ back: 1 })
    .setSlot(0)
    .pushOutput(0)
    .follow()
    .follow()
    .read() // subregistries[registry][tokenId]
    .requireNonzero() // require registry
    .slice(12, 20)
    .requireNonzero() // check address
    .pushBytes(ethers.toBeHex(0, 12))
    .dup(1)
    .concat(2)
    .setOutput(0) // save it
    .end()
    .eval({ failure: true }) // loop until we get a failure
    .pushOutput(1)
    .requireNonzero()
    .target() // set target to resolver
    .setSlot(1)
    .pushInput(iNode)
    .follow()
    .read() // versions[node]
    .setSlot(11)
    .follow()
    .pushInput(iNode)
    .follow()
    .pushStr('name')
    .follow()
    .readBytes()
    .setOutput(2); // text[versions[node]][node][key]

  const state = await prover.evalRequest(req);
  const values = await state.resolveOutputs();
  console.log({
    name,
    registry: ethers.getAddress(ethers.dataSlice(values[0], 12)),
  });
  if (state.exitCode) {
    console.log(`<doesn't exist>`);
  } else {
    console.log({
      resolver: ethers.getAddress(ethers.dataSlice(values[0], 12)),
      flags: ethers.dataSlice(values[0], 0, 12),
      text: ethers.toUtf8String(values[2]),
    });
  }
}

await resolve('raffy.eth');
await resolve('chonk.raffy.eth');
await resolve('does-not-exist'); // no resolver

foundry.shutdown();
