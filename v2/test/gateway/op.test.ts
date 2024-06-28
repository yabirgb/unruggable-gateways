import {OPFaultGateway} from '../../src/gateway/OPFaultGateway.js';
import {serve} from '@resolverworks/ezccip';
import {Foundry} from '@adraffy/blocksmith';
import {createProvider, providerURL, CHAIN_OP} from '../../src/providers.js';
import {runSlotDataTests} from './tests.js';
import {describe, afterAll} from 'bun:test';

describe('op', async () => {	
	let foundry = await Foundry.launch({
		fork: providerURL(1)
	});
	afterAll(() => foundry.shutdown());
	let gateway = OPFaultGateway.mainnet({
		provider1: foundry.provider,
		provider2: createProvider(CHAIN_OP),
		commitDelay: 0
	});	
	let ccip = await serve(gateway, {protocol: 'raw', port: 0});	
	afterAll(() => ccip.http.close());
	let verifier = await foundry.deploy({file: 'OPFaultVerifier', args: [[ccip.endpoint], gateway.optimismPortal, gateway.commitDelay]});
	// https://optimistic.etherscan.io/address/0xf9d79d8c09d24e0C47E32778c830C545e78512CF
	let reader = await foundry.deploy({file: 'SlotDataReader', args: [verifier, '0xf9d79d8c09d24e0C47E32778c830C545e78512CF']});
	runSlotDataTests(reader);
});
