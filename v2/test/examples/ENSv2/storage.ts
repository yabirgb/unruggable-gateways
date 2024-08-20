import type { HexString } from '../../../src/types.js';
import { ethers } from 'ethers';
import { Foundry } from '@adraffy/blocksmith';
import { EVMRequest } from '../../../src/vm.js';
import { EthProver } from '../../../src/eth/EthProver.js';
import { ABI_CODER } from '../../../src/utils.js';

const foundry = await Foundry.launch({ procLog: false });

function dns(name: string) {
  return ethers.dnsEncode(name, 255);
}

async function deployResolver() {
  //return foundry.deploy({import: '@ensdomains/ens-contracts/contracts/resolvers/OwnedResolver.sol'});
  return foundry.deploy({
    sol: `
		contract Resolver {
			mapping (bytes32 => mapping(string => string)) _texts;
			function setText(bytes32 node, string memory key, string memory value) external {
				_texts[node][key] = value;
			}
		}
	`,
  });
}

const wallet_admin = foundry.requireWallet('admin');
const wallet_raffy = await foundry.createWallet();

const resolver_eth = await deployResolver();
const resolver_raffy = await deployResolver();

const storage = await foundry.deploy({ file: 'RegistryStorage' });

async function deployRegistry(parent: HexString) {
  return foundry.deploy({ file: 'V2Registry', args: [storage, parent] });
}
const registry_root = await deployRegistry(ethers.ZeroAddress);
const registry_eth = await deployRegistry(registry_root.target);

await foundry.confirm(
  storage.setRegistry(ethers.ZeroAddress, ethers.ZeroHash, registry_root)
);
await foundry.confirm(
  registry_root.setSubnode(
    wallet_admin,
    dns('eth'),
    resolver_eth,
    registry_eth,
    wallet_admin
  )
);
await foundry.confirm(
  registry_eth.setSubnode(
    wallet_raffy,
    dns('raffy.eth'),
    resolver_raffy,
    ethers.ZeroAddress,
    wallet_raffy
  )
);

await foundry.confirm(
  resolver_eth.setText(ethers.namehash('chonk.eth'), 'name', 'Chonk')
);
await foundry.confirm(
  resolver_raffy.setText(ethers.namehash('raffy.eth'), 'name', 'Raffy')
);
await foundry.confirm(
  resolver_raffy.setText(ethers.namehash('sub.raffy.eth'), 'name', 'Subdomain!')
);

const prover = await EthProver.latest(foundry.provider);

async function resolve(name: string) {
  console.log();
  const req = new EVMRequest(3);
  req.setTarget(storage.target); // use storage contract
  req.push(0).setOutput(0); // start at root (NOOP)
  name
    .split('.')
    .forEach((_, i, v) => req.push(ethers.namehash(v.slice(i).join('.'))));
  req.push(0); // add namehash for root
  req.setSlot(0); // _nodes mapping (NOOP)
  req
    .begin()
    .pushOutput(0) // parent registry (exists)
    .follow()
    .follow() // map[registry][node]
    .read() // resolver
    .begin()
    .requireNonzero()
    .setOutput(1) // save nonzero resolver
    .end()
    .eval({ back: 1 })
    .offset(1)
    .read() // registry
    .requireNonzero() // require registry
    .setOutput(0) // save it
    .end()
    .eval({ failure: true }); // loop until we get a failure
  req
    .pushOutput(1)
    .requireNonzero()
    .target() // set target to resolver
    .setSlot(0) // _texts mapping (NOOP)
    .push(ethers.namehash(name))
    .follow()
    .pushStr('name')
    .follow() // _texts[node][key]
    .readBytes()
    .setOutput(2); // read text(name) store into output

  const state = await prover.evalRequest(req);
  const values = await state.resolveOutputs();
  //console.log(state);
  console.log({
    name,
    registry: ABI_CODER.decode(['address'], values[0])[0],
  });
  if (state.exitCode) {
    console.log(`<doesn't exist>`);
  } else {
    console.log({
      resolver: ABI_CODER.decode(['address'], values[1])[0],
      text: ethers.toUtf8String(values[2]),
    });
  }
}

await resolve('raffy.eth'); // raffy resolver
await resolve('sub.raffy.eth'); // raffy resolver (-1)
await resolve('chonk.eth'); // eth resolver
await resolve('does-not-exist'); // no resolver

foundry.shutdown();
