import {ethers} from 'ethers';
import {Foundry} from '@adraffy/blocksmith';
import {EVMProver, EVMRequest} from '../../../src/vm.js';
import { HexString } from '../../../src/types.js';

let foundry = await Foundry.launch({procLog: false});

function dns(name: string) {
	return ethers.dnsEncode(name, 255);
}

async function deployResolver() {
	//return foundry.deploy({import: '@ensdomains/ens-contracts/contracts/resolvers/OwnedResolver.sol'});
	return foundry.deploy({sol: `
		contract Resolver {
			mapping (bytes32 => mapping(string => string)) _texts;
			function setText(bytes32 node, string memory key, string memory value) external {
				_texts[node][key] = value;
			}
		}
	`});
}

let wallet_admin = foundry.requireWallet('admin');
let wallet_raffy = await foundry.createWallet();

let resolver_eth = await deployResolver();
let resolver_raffy = await deployResolver();

let storage = await foundry.deploy({file: 'RegistryStorage'});

async function deployRegistry(parent: HexString) {
	return foundry.deploy({file: 'V2Registry', args: [storage, parent]});
}
let registry_root = await deployRegistry(ethers.ZeroAddress);
let registry_eth  = await deployRegistry(registry_root.target);

await foundry.confirm(storage.setRegistry(ethers.ZeroAddress, ethers.ZeroHash, registry_root))
await foundry.confirm(registry_root.setSubnode(wallet_admin, dns('eth'), resolver_eth, registry_eth, wallet_admin));
await foundry.confirm(registry_eth.setSubnode(wallet_raffy, dns('raffy.eth'), resolver_raffy, ethers.ZeroAddress, wallet_raffy));

await foundry.confirm(resolver_eth.setText(ethers.namehash('chonk.eth'), 'name', 'Chonk'));
await foundry.confirm(resolver_raffy.setText(ethers.namehash('raffy.eth'), 'name', 'Raffy'));
await foundry.confirm(resolver_raffy.setText(ethers.namehash('sub.raffy.eth'), 'name', 'Subdomain!'));

let prover = await EVMProver.latest(foundry.provider);
//prover.log = console.log;

async function resolve(name: string) {
	console.log();
	let req = new EVMRequest(3);
	req.setTarget(storage.target); // use storage contract
	req.push(0).setOutput(0); // start at root (not actually needed)
	name.split('.').forEach((_, i, v) => req.push(ethers.namehash(v.slice(i).join('.'))));
	req.push(0); // add namehash for root
	req.setSlot(0) // _nodes mapping
	req.begin()
		.pushOutput(0) // parent registry (exists)
		.follow().follow() // map[registry][node]
		.read() // resolver
		.begin()
			.requireNonzero().setOutput(1) // save nonzero resolver
		.end().eval({back: 1})
		.offset(1).read() // registry
		.requireNonzero() // require registry
		.setOutput(0) // save it
	.end().eval({failure: true}) // loop until we get a failure
	req.pushOutput(1).requireNonzero().target() // set target to resolver
		.setSlot(0) // _texts mapping
		.push(ethers.namehash(name)).follow().pushStr('name').follow() // _texts[node][key]
		.readBytes().setOutput(2); // read text(name) store into output	

	let state = await prover.evalRequest(req);
	let values = await state.resolveOutputs();
	//console.log(state);
	console.log({
		name,
		registry: ethers.AbiCoder.defaultAbiCoder().decode(['address'], values[0])[0],
	});
	if (state.exitCode) {
		console.log(`<doesn't exist>`);
	} else {
		console.log({
			resolver: ethers.AbiCoder.defaultAbiCoder().decode(['address'], values[1])[0],
			text: ethers.toUtf8String(values[2])
		});
	}
}

await resolve('raffy.eth'); // raffy resolver
await resolve('sub.raffy.eth'); // raffy resolver (-1)
await resolve('chonk.eth'); // eth resolver
await resolve('does-not-exist'); // no resolver

foundry.shutdown();
