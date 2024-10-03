import type { Chain, ChainPair, HexAddress } from '../../src/types.js';
import type { RollupDeployment } from '../../src/rollup.js';
import { Gateway } from '../../src/gateway.js';
import { createProviderPair, providerURL } from '../providers.js';
import { chainName } from '../../src/chains.js';
import { serve } from '@resolverworks/ezccip';
import { DeployedContract, Foundry } from '@adraffy/blocksmith';
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

// export async function deployProxy(foundry: Foundry, verifier: Contract) {
//   const wallet = foundry.wallets.admin;
//   const proxy = await foundry.deploy({
//     import:
//       '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol',
//     args: [verifier, wallet, '0x'],
//   });
//   return new Contract(proxy.target, verifier.interface, wallet);
// }

type TestOptions = {
  slotDataContract: HexAddress;
  slotDataPointer?: HexAddress;
  skipCI?: boolean;
  log?: boolean;
};

export async function setupTests(
  verifier: DeployedContract,
  options: TestOptions
) {
  const foundry = Foundry.of(verifier);
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, options.slotDataContract],
  });
  if (options.slotDataPointer) {
    await foundry.confirm(reader.setPointer(options.slotDataPointer));
  }
  runSlotDataTests(reader, !!options.slotDataPointer);
}

function shouldSkip(opts: TestOptions) {
  return !!opts.skipCI && !!process.env.IS_CI;
}

export function testOP(config: RollupDeployment<OPConfig>, opts: TestOptions) {
  describe.skipIf(shouldSkip(opts))(pairName(config), async () => {
    const rollup = new OPRollup(createProviderPair(config), config);
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: !!opts.log,
    });
    afterAll(() => foundry.shutdown());
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(() => ccip.http.close());
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'OPVerifier',
      args: [
        [ccip.endpoint],
        rollup.defaultWindow,
        hooks,
        rollup.L2OutputOracle,
      ],
      libs: { GatewayVM },
    });
    await setupTests(verifier, opts);
  });
}

export function testOPFault(
  config: RollupDeployment<OPFaultConfig>,
  opts: TestOptions
) {
  describe.skipIf(shouldSkip(opts))(pairName(config), async () => {
    const rollup = new OPFaultRollup(createProviderPair(config), config);
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: !!opts.log,
    });
    afterAll(() => foundry.shutdown());
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(() => ccip.http.close());
    const commit = await gateway.getLatestCommit();
    const gameFinder = await foundry.deploy({
      file: 'FixedOPFaultGameFinder',
      args: [commit.index],
    });
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'OPFaultVerifier',
      args: [
        [ccip.endpoint],
        rollup.defaultWindow,
        hooks,
        rollup.OptimismPortal,
        gameFinder,
        rollup.gameTypeBitMask,
      ],
      libs: { GatewayVM },
    });
    await setupTests(verifier, opts);
  });
}

export function testScroll(
  config: RollupDeployment<ScrollConfig>,
  opts: TestOptions
) {
  describe.skipIf(shouldSkip(opts))(pairName(config), async () => {
    const rollup = await ScrollRollup.create(
      createProviderPair(config),
      config
    );
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: !!opts.log,
    });
    afterAll(() => foundry.shutdown());
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(() => ccip.http.close());
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({
      file: 'ScrollVerifierHooks',
      args: [rollup.poseidon],
    });
    const verifier = await foundry.deploy({
      file: 'ScrollVerifier',
      args: [[ccip.endpoint], rollup.defaultWindow, hooks, rollup.rollup],
      libs: { GatewayVM },
    });
    await setupTests(verifier, opts);
  });
}

export function testSelfEth(chain: Chain, opts: TestOptions) {
  describe.skipIf(shouldSkip(opts))(chainName(chain), async () => {
    const foundry = await Foundry.launch({
      fork: providerURL(chain),
      infoLog: !!opts.log,
    });
    afterAll(() => foundry.shutdown());
    const rollup = new EthSelfRollup(foundry.provider);
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(() => ccip.http.close());
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'SelfVerifier',
      args: [[ccip.endpoint], rollup.defaultWindow, hooks],
      libs: { GatewayVM },
    });
    await setupTests(verifier, opts);
  });
}
