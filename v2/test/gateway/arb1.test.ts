import {NitroGateway} from '../../src/gateway/NitroGateway.js';
import {serve} from '@resolverworks/ezccip';
import {Foundry} from '@adraffy/blocksmith';
import {createProvider, providerURL, CHAIN_ARB1} from '../../src/providers.js';
import {runSlotDataTests} from './tests.js';
import {describe, afterAll} from 'bun:test';

describe('arb1', async () => {	
	let foundry = await Foundry.launch({
		fork: providerURL(1),
	});
	afterAll(() => foundry.shutdown());
	let gateway = NitroGateway.arb1Mainnet({
		provider1: foundry.provider,
		provider2: createProvider(CHAIN_ARB1),
		commitDelay: 0n
	});	
	let ccip = await serve(gateway, {protocol: 'raw', port: 0});	
	afterAll(() => ccip.http.close());
	let verifier = await foundry.deploy({file: 'NitroVerifier', args: [[ccip.endpoint], gateway.L2Rollup, gateway.commitDelay]});
	// https://arbiscan.io/address/0xCC344B12fcc8512cc5639CeD6556064a8907c8a1#code
	let reader = await foundry.deploy({file: 'SlotDataReader', args: [verifier, '0xCC344B12fcc8512cc5639CeD6556064a8907c8a1']});
	runSlotDataTests(reader);	
});
