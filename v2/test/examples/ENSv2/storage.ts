import {
  dnsEncode,
  namehash,
  ZeroAddress,
  ZeroHash,
  AbiCoder,
  toUtf8String,
} from 'ethers';
import { Foundry } from '@adraffy/blocksmith';
import { EVMRequest } from '../../../src/vm.js';
import { EVMProver } from '../../../src/evm/prover.js';
import { HexString } from '../../../src/types.js';

const coder = AbiCoder.defaultAbiCoder();

const foundry = await Foundry.launch({ procLog: false });

function dns(name: string) {
  return dnsEncode(name, 255);
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
const registry_root = await deployRegistry(ZeroAddress);
const registry_eth = await deployRegistry(registry_root.target);

await foundry.confirm(
  storage.setRegistry(ZeroAddress, ZeroHash, registry_root)
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
    ZeroAddress,
    wallet_raffy
  )
);

await foundry.confirm(
  resolver_eth.setText(namehash('chonk.eth'), 'name', 'Chonk')
);
await foundry.confirm(
  resolver_raffy.setText(namehash('raffy.eth'), 'name', 'Raffy')
);
await foundry.confirm(
  resolver_raffy.setText(namehash('sub.raffy.eth'), 'name', 'Subdomain!')
);

const prover = await EVMProver.latest(foundry.provider);
//prover.log = console.log;

async function resolve(name: string) {
  console.log();
  const req = new EVMRequest(3);
  req.setTarget(storage.target); // use storage contract
  req.push(0).setOutput(0); // start at root (NOOP)
  name
    .split('.')
    .forEach((_, i, v) => req.push(namehash(v.slice(i).join('.'))));
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
    .push(namehash(name))
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
    registry: coder.decode(['address'], values[0])[0],
  });
  if (state.exitCode) {
    console.log(`<doesn't exist>`);
  } else {
    console.log({
      resolver: coder.decode(['address'], values[1])[0],
      text: toUtf8String(values[2]),
    });
  }
}

await resolve('raffy.eth'); // raffy resolver
await resolve('sub.raffy.eth'); // raffy resolver (-1)
await resolve('chonk.eth'); // eth resolver
await resolve('does-not-exist'); // no resolver

foundry.shutdown();
