import type { Chain, ChainPair, HexAddress } from '../../src/types.js';
import type { RollupDeployment } from '../../src/rollup.js';
import { Contract } from 'ethers';
import { Gateway } from '../../src/gateway.js';
import { createProviderPair, providerURL } from '../providers.js';
import { chainName } from '../../src/chains.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { runSlotDataTests } from './tests.js';
import { type OPConfig, OPRollup } from '../../src/op/OPRollup.js';
import {
  type OPFaultConfig,
  OPFaultRollup,
} from '../../src/op/OPFaultRollup.js';
import {
  type ScrollConfig,
  ScrollRollup,
} from '../../src/scroll/ScrollRollup.js';
import { EthSelfRollup } from '../../src/eth/EthSelfRollup.js';
import { afterAll } from 'bun:test';
import { describe } from '../bun-describe-fix.js';

export function pairName(pair: ChainPair, reverse = false) {
  return `${chainName(pair.chain1)} ${reverse ? '<=' : '=>'} ${chainName(pair.chain2)}`;
}

export async function deployProxy(foundry: Foundry, verifier: Contract) {
  const wallet = foundry.wallets.admin;
  const proxy = await foundry.deploy({
    import:
      '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol',
    args: [verifier, wallet, '0x'],
  });
  return new Contract(proxy.target, verifier.interface, wallet);
}

type TestOptions = {
  slotDataContract: HexAddress;
  slotDataPointer?: HexAddress;
  skipCI?: boolean;
  log?: boolean;
};

export function testOP(
  config: RollupDeployment<OPConfig>,
  { slotDataContract, skipCI = false, log = false }: TestOptions
) {
  describe.skipIf(skipCI && !!process.env.IS_CI)(pairName(config), async () => {
    const rollup = new OPRollup(createProviderPair(config), config);
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: log,
    });
    //foundry.provider.on('debug', e => console.log(JSON.stringify(e)));
    afterAll(() => foundry.shutdown());
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log });
    afterAll(() => ccip.http.close());
    const verifier = await foundry.deploy({ file: 'OPVerifier' });
    const proxy = await deployProxy(foundry, verifier);
    await foundry.confirm(proxy.setGatewayURLs([ccip.endpoint]));
    await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
    await foundry.confirm(proxy.setOracle(rollup.L2OutputOracle));
    const reader = await foundry.deploy({
      file: 'SlotDataReader',
      args: [proxy, slotDataContract],
    });
    runSlotDataTests(reader);
  });
}

export function testOPFault(
  config: RollupDeployment<OPFaultConfig>,
  { slotDataContract, skipCI = false, log = false }: TestOptions
) {
  describe.skipIf(skipCI && !!process.env.IS_CI)(pairName(config), async () => {
    const rollup = new OPFaultRollup(createProviderPair(config), config);
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: log,
    });
    afterAll(() => foundry.shutdown());
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log });
    afterAll(() => ccip.http.close());
    const commit = await gateway.getLatestCommit();
    const gameFinder = await foundry.deploy({
      file: 'FixedOPFaultGameFinder',
      args: [commit.index],
    });
    const verifier = await foundry.deploy({
      file: 'OPFaultVerifier',
      args: [gameFinder],
    });
    const proxy = await deployProxy(foundry, verifier);
    await foundry.confirm(proxy.setGatewayURLs([ccip.endpoint]));
    await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
    await foundry.confirm(proxy.setPortal(rollup.OptimismPortal));
    const reader = await foundry.deploy({
      file: 'SlotDataReader',
      args: [proxy, slotDataContract],
    });
    runSlotDataTests(reader);
  });
}

export function testScroll(
  config: RollupDeployment<ScrollConfig>,
  {
    slotDataContract,
    slotDataPointer,
    skipCI = false,
    log = false,
  }: TestOptions
) {
  describe.skipIf(skipCI && !!process.env.IS_CI)(pairName(config), async () => {
    const rollup = await ScrollRollup.create(
      createProviderPair(config),
      config
    );
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: log,
    });
    afterAll(() => foundry.shutdown());
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log });
    afterAll(() => ccip.http.close());
    const verifier = await foundry.deploy({ file: 'ScrollVerifier' });
    const proxy = await deployProxy(foundry, verifier);
    await foundry.confirm(proxy.setGatewayURLs([ccip.endpoint]));
    await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
    await foundry.confirm(
      proxy.setCommitmentVerifier(rollup.CommitmentVerifier)
    );
    const reader = await foundry.deploy({
      file: 'SlotDataReader',
      args: [proxy, slotDataContract],
    });
    if (slotDataPointer) {
      await foundry.confirm(reader.setPointer(slotDataPointer));
    }
    runSlotDataTests(reader, !!slotDataPointer);
  });
}

export function testSelfEth(
  chain: Chain,
  { slotDataContract, skipCI = false, log = false }: TestOptions
) {
  describe.skipIf(skipCI && !process.env.IS_CI)(chainName(chain), async () => {
    const foundry = await Foundry.launch({
      fork: providerURL(chain),
      infoLog: log,
    });
    afterAll(() => foundry.shutdown());
    const rollup = new EthSelfRollup(foundry.provider);
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log });
    afterAll(() => ccip.http.close());
    const verifier = await foundry.deploy({ file: 'EthSelfVerifier' });
    const proxy = await deployProxy(foundry, verifier);
    await foundry.confirm(proxy.setGatewayURLs([ccip.endpoint]));
    await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
    // https://etherscan.io/address/0xC9D1E777033FB8d17188475CE3D8242D1F4121D5#code
    // https://sepolia.etherscan.io/address/0x494d872430442EdB6c1e05BB5521084Ad50312b2
    const reader = await foundry.deploy({
      file: 'SlotDataReader',
      args: [proxy, slotDataContract],
    });
    runSlotDataTests(reader);
  });
}
