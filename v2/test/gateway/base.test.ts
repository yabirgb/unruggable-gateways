import {OPGateway} from '../../src/gateway/OPGateway.js';
import {serve} from '@resolverworks/ezccip';
import {Foundry} from '@adraffy/blocksmith';
import {createProvider, providerURL, CHAIN_BASE} from '../../src/providers.js';
import {runSlotDataTests} from './tests.js';
import {describe, afterAll} from 'bun:test';

describe('base', async () => {	
	let foundry = await Foundry.launch({
		fork: providerURL(1)
	});
	let gateway = OPGateway.baseMainnet({
		provider1: foundry.provider,
		provider2: createProvider(CHAIN_BASE)
	});	
	let ccip = await serve(gateway, {protocol: 'raw'});	
	let verifier = await foundry.deploy({file: 'OPVerifier', args: [[ccip.endpoint], gateway.outputOracle, gateway.commitDelay]});
	// https://basescan.org/address/0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6
	let reader = await foundry.deploy({file: 'SlotDataReader', args: [verifier, '0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6']});
	runSlotDataTests(reader);	
	afterAll(() => {
		foundry.shutdown();
		ccip.http.close();
	});
});
