import type { HexAddress } from '../../src/types.js';
import type { RollupDeployment } from '../../src/rollup.js';
import { Gateway } from '../../src/gateway.js';
import { createProviderPair, providerURL, chainName } from '../providers.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { describe, afterAll } from 'bun:test';
import { runSlotDataTests } from './tests.js';
import { type OPConfig, OPRollup } from '../../src/op/OPRollup.js';
import {
  type OPFaultConfig,
  OPFaultRollup,
} from '../../src/op/OPFaultRollup.js';
import { ABI_CODER } from '../../src/utils.js';
import { Contract, dd } from 'ethers';
import { expect, test } from 'bun:test';

export function testOP(
  config: RollupDeployment<OPConfig>,
  slotDataReaderAddress: HexAddress
) {
  describe(chainName(config.chain2), async () => {
    const rollup = new OPRollup(createProviderPair(config), config);
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: false,
    });
    afterAll(() => foundry.shutdown());
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, {
      protocol: 'raw',
      log: false,
    });
    afterAll(() => ccip.http.close());
    const verifier = await foundry.deploy({
      file: 'OPVerifier',
      args: [[ccip.endpoint], rollup.defaultWindow, rollup.L2OutputOracle],
    });
    const reader = await foundry.deploy({
      file: 'SlotDataReader',
      args: [verifier, slotDataReaderAddress],
    });
    runSlotDataTests(reader);
  });
}

export function testOPFault(
  config: RollupDeployment<OPFaultConfig>,
  slotDataReaderAddress: HexAddress
) {
  describe(chainName(config.chain2), async () => {
    const rollup = await OPFaultRollup.create(
      createProviderPair(config),
      config
    );
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: false,
      //procLog: true,
    });

    //console.log(foundry.provider);

    afterAll(() => foundry.shutdown());
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, {
      protocol: 'raw',
      log: false,
    });
    afterAll(() => ccip.http.close());
    const commit = await gateway.getLatestCommit();
    const gameFinder = await foundry.deploy({
      file: 'FixedOPFaultGameFinder',
      args: [commit.index],
    });
    const verifier = await foundry.deploy({
      file: 'OPFaultVerifier',
      args: [],
    });

    const gatewayUrlsBytes = ABI_CODER.encode(['string[]'], [[ccip.endpoint]]);
    const windowBytes = ABI_CODER.encode(['uint256'], [rollup.defaultWindow]);
    const rollupAddressBytes = ABI_CODER.encode(
      ['address'],
      [rollup.OptimismPortal.target]
    );

    const theArgs = [
      verifier.target,
      (await foundry.ensureWallet('admin')).address,
      '0x',
      gatewayUrlsBytes,
      windowBytes,
      rollupAddressBytes,
    ];

    console.log('args', theArgs);

    const proxy = await foundry.deploy({
      file: 'VerifierProxy',
      args: theArgs,
    });

    //process.exit();

    const gameTypeBytes = ABI_CODER.encode(
      ['uint256'],
      [rollup.gameTypeBitMask]
    );
    const gameFinderBytes = ABI_CODER.encode(['address'], [gameFinder.target]);

    await proxy.setConfig('gameTypes', gameTypeBytes);
    await proxy.setConfig('gameFinder', gameFinderBytes);

    console.log('proxy', proxy.target);
    //process.exit();

    const reader = await foundry.deploy({
      file: 'SlotDataReader',
      args: [proxy, slotDataReaderAddress],
    });

    //const proxI = await proxy._impl();
    //console.log('impl', proxI);
  
    const implementationABI = [
      'function gatewayURLs() public view returns (string[] memory)',
    ];

    const anotherWallet = await foundry.createWallet();
    // Initialize the contract with the implementation ABI
    const proxyContract = new Contract(
      proxy.target,
      implementationABI,
      anotherWallet
    );

    //const gw = await proxyContract.gatewayURLs();
    //console.log('gw', gw);

    console.log(typeof foundry.provider);
    //process.exit();


    //const val = await proxy.staticReadProxyLevel();
    //console.log('reader', reader.target);

    //const aw = await foundry.createWallet();

    /*test('latest = 49', () => {
      expect(reader.readLatest({ enableCcipRead: true, gasLimit:3e7 })).resolves.toStrictEqual(
        49n
      );
    });*/
    const result = reader.readLatest({ enableCcipRead: true });
    console.log('CCIP read result:', result);

    /*try {
      // Call the contract function with enableCcipRead option set to true
      const result = await reader.readLatest({ enableCcipRead: true, gasLimit: 3e7 });
      console.log('CCIP read result:', result);
  } catch (error) {
      console.error('Error handling CCIP read:', error);

      // Additional debug information
      if (error.code === 'CALL_EXCEPTION' && error.data.startsWith('0x556f1830')) {
          console.log('Detected OffchainLookup error. Please check your contract setup and off-chain gateway.');
      }
  }*/
    //console.log('ccip', ccipr);
    runSlotDataTests(reader);
  });
}
