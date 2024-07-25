import { Foundry } from '@adraffy/blocksmith';
//import { serve } from '@resolverworks/ezccip';
import {
  //createProvider,
  providerURL,
  //CHAIN_OP,
} from '../../providers.js';
//import { OPFaultGateway } from '../../../src/gateway/OPFaultGateway.js';
import {
  dnsEncode,
  AbiCoder,
  toBeHex,
  namehash,
  getAddress,
  Interface,
} from 'ethers';
import { solidityFollowSlot } from '../../../src/vm.js';
import { afterAll, describe, test, expect } from 'bun:test';

export const ABI_CODER = AbiCoder.defaultAbiCoder();

function dns(name: string) {
  return dnsEncode(name, 255);
}

const ENS = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const NAME = 'clowes.eth';
const NODE = namehash(NAME);
const SLOT = solidityFollowSlot(0, NODE) + 1n;

const MY_ADDRESS = '0xAC50cE326de14dDF9b7e9611Cd2F33a1Af8aC039';

describe('ENSv2', async () => {
  const foundry = await Foundry.launch({
    fork: providerURL(1),
    infoLog: true,
    procLog: true,
  });

  afterAll(() => foundry.shutdown());

  /**
   * To run the example against a development gateway, uncomment the below
   * and comment out the hardcoded values that follow.
   */

  /*
  let gateway = OPFaultGateway.mainnet({
    provider1: foundry.provider,
    provider2: createProvider(CHAIN_OP),
    commitDelay: 0,
  });

  afterAll(() => gateway.shutdown());

  let ccip = await serve(gateway, { protocol: 'raw' });

  afterAll(() => ccip.shutdown());

  const gatewayUrls = [ccip.endpoint];
  const optimismPortal = gateway.OptimismPortal;
  const delay = gateway.commitDelay;
  */

  const gatewayUrls = ['https://op-gateway.unruggable.com'];
  const optimismPortal = '0xbEb5Fc579115071764c7423A4f12eDde41f106Ed';
  const delay = 0;

  const verifier = await foundry.deploy({
    file: 'OwnedOPFaultVerifier',
    args: [gatewayUrls, optimismPortal, delay],
  });

  const opResolver = await foundry.deploy({
    file: 'OPResolver',
    args: [verifier],
  });

  const resolverBefore = await foundry.provider.getResolver(NAME);
  console.log('Queried before: ', resolverBefore?.address);

  // replace real resolver with fake (the one we just deployed)
  await foundry.provider.send('anvil_setStorageAt', [
    ENS,
    toBeHex(SLOT, 32),
    toBeHex(opResolver.target, 32),
  ]);

  //Get the Resolver using ethers
  const resolver = await foundry.provider.getResolver(NAME);

  test('verify resolver was hijacked', async () => {
    expect(resolver?.address).toBe(opResolver.target);
  });

  test('get address basic', async () => {
    //Resolve the name using ethers in built resolution
    const coinTypeAddress = await resolver?.getAddress();
    expect(coinTypeAddress).toBe(MY_ADDRESS);
  });

  test('get address w/ cointype', async () => {
    //Resolve the name using ethers in built resolution
    const coinTypeAddress = await resolver?.getAddress(1);
    expect(coinTypeAddress).toBe(MY_ADDRESS);
  });

  test('manually constructed basic resolution call', async () => {
    //Manually construct the IAddrResolver calldata for an extra check
    const addrInterface = new Interface([
      'function addr(bytes32 node) returns (address payable)',
    ]);

    const resolutionCalldata = addrInterface.encodeFunctionData('addr', [NODE]);

    //Manually call the resolution function
    const result = await opResolver.resolve(dns(NAME), resolutionCalldata, {
      enableCcipRead: true,
    });

    //Decode the result
    const resolvedAddress = ABI_CODER.decode(['address'], result)[0];
    console.log('Resolved address (manual): ', resolvedAddress);

    expect(resolvedAddress).toBe(MY_ADDRESS);
  });

  test.only('manually constructed resolution call w/cointype', async () => {
    //Manually construct the IAddressResolver calldata for an extra check
    const addressInterface = new Interface([
      'function addr(bytes32 node, uint256 coinType) returns (bytes memory)',
    ]);

    const resolutionCalldata = addressInterface.encodeFunctionData('addr', [
      NODE,
      1,
    ]);

    //Manually call the resolution function
    const result = await opResolver.resolve(dns(NAME), resolutionCalldata, {
      enableCcipRead: true,
    });

    //Decode the result
    const resolvedAddress = getAddress(ABI_CODER.decode(['bytes'], result)[0]);
    console.log('Resolved address (manual): ', resolvedAddress);

    expect(resolvedAddress).toBe(MY_ADDRESS);
  });

  /**
   * The below outputs all three addresses if utilising the debugCallback in OPResolver.sol
   */

  /*
  const [bytesArray] = ABI_CODER.decode(['bytes[]'], result);

  console.log('bytesArray', bytesArray);

  const [registry, resolver, resolved] = bytesArray.map(
    (value) => ABI_CODER.decode(['address'], value)[0]
  );

  console.log('Registry: ', registry);
  console.log('Resolver: ', resolver);
  console.log('Resolved: ', resolved);
  */
});
