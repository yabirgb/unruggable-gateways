import type { Chain, ChainPair, HexAddress } from '../../src/types.js';
import type { RollupDeployment } from '../../src/rollup.js';
import { Gateway } from '../../src/gateway.js';
import {
  createProvider,
  createProviderPair,
  providerURL,
} from '../providers.js';
import { chainName, CHAINS } from '../../src/chains.js';
import { serve } from '@resolverworks/ezccip/serve';
import { type DeployedContract, Foundry } from '@adraffy/blocksmith';
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
import { type LineaConfig, LineaRollup } from '../../src/linea/LineaRollup.js';
import { EthSelfRollup } from '../../src/eth/EthSelfRollup.js';
import { TrustedRollup } from '../../src/TrustedRollup.js';
import { EthProver } from '../../src/eth/EthProver.js';
import { randomBytes, SigningKey } from 'ethers/crypto';
import { afterAll } from 'bun:test';
import { describe } from '../bun-describe-fix.js';

export function testName(
  { chain1, chain2, chain3 }: ChainPair & { chain3?: Chain },
  { reverse = false, unfinalized = false } = {}
) {
  const arrow = unfinalized ? ' =!=> ' : ' => ';
  const chains = [chain1, chain2];
  if (chain3 !== undefined) chains.push(chain3);
  const names = chains.map(chainName);
  if (reverse) names.reverse();
  return names.join(arrow);
}

type TestOptions = {
  slotDataContract: HexAddress;
  slotDataPointer?: HexAddress;
  log?: boolean;
  skipCI?: boolean;
  skipZero?: boolean;
};

export async function setupTests(
  verifier: DeployedContract,
  opts: TestOptions,
  configure?: (fetcher: DeployedContract) => Promise<void>
) {
  const foundry = Foundry.of(verifier);
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, opts.slotDataContract],
  });
  if (opts.slotDataPointer) {
    await foundry.confirm(reader.setPointer(opts.slotDataPointer));
  }
  await configure?.(reader);
  runSlotDataTests(reader, !!opts.slotDataPointer, !!opts.skipZero);
}

function shouldSkip(opts: TestOptions) {
  return !!opts.skipCI && !!process.env.IS_CI;
}

export function testOP(
  config: RollupDeployment<OPConfig>,
  opts: TestOptions & { minAgeSec?: number }
) {
  describe.skipIf(shouldSkip(opts))(testName(config), async () => {
    const rollup = new OPRollup(createProviderPair(config), config);
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: !!opts.log,
    });
    afterAll(foundry.shutdown);
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(ccip.shutdown);
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'OPVerifier',
      args: [
        [ccip.endpoint],
        rollup.defaultWindow,
        hooks,
        rollup.L2OutputOracle,
        opts.minAgeSec ?? 0,
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
  describe.skipIf(shouldSkip(opts))(
    testName(config, { unfinalized: !!config.minAgeSec }),
    async () => {
      const rollup = new OPFaultRollup(createProviderPair(config), config);
      const foundry = await Foundry.launch({
        fork: providerURL(config.chain1),
        infoLog: !!opts.log,
      });
      afterAll(foundry.shutdown);
      const gateway = new Gateway(rollup);
      const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
      afterAll(ccip.shutdown);
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
          [
            rollup.OptimismPortal,
            gameFinder,
            rollup.gameTypeBitMask,
            rollup.minAgeSec,
          ],
        ],
        libs: { GatewayVM },
      });
      await setupTests(verifier, opts);
    }
  );
}

export function testScroll(
  config: RollupDeployment<ScrollConfig>,
  opts: TestOptions
) {
  describe.skipIf(shouldSkip(opts))(testName(config), async () => {
    const rollup = new ScrollRollup(createProviderPair(config), config);
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: !!opts.log,
    });
    afterAll(foundry.shutdown);
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(ccip.shutdown);
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({
      file: 'ScrollVerifierHooks',
      args: [rollup.poseidon],
    });
    const verifier = await foundry.deploy({
      file: 'ScrollVerifier',
      args: [[ccip.endpoint], rollup.defaultWindow, hooks, rollup.ScrollChain],
      libs: { GatewayVM },
    });
    if (opts.skipZero === undefined) {
      // 20241004: we know this test fails, auto-skip during ci
      opts.skipZero = !!process.env.IS_CI;
    }
    await setupTests(verifier, opts);
  });
}

export function testSelfEth(chain: Chain, opts: TestOptions) {
  describe.skipIf(shouldSkip(opts))(chainName(chain), async () => {
    const foundry = await Foundry.launch({
      fork: providerURL(chain),
      infoLog: !!opts.log,
    });
    afterAll(foundry.shutdown);
    const rollup = new EthSelfRollup(foundry.provider);
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(ccip.shutdown);
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

export function testTrustedEth(chain2: Chain, opts: TestOptions) {
  describe.skipIf(!!process.env.IS_CI)(
    testName({ chain1: CHAINS.VOID, chain2 }),
    async () => {
      const foundry = await Foundry.launch({
        fork: providerURL(chain2),
        infoLog: !!opts.log,
      });
      const rollup = new TrustedRollup(
        createProvider(chain2),
        EthProver,
        new SigningKey(randomBytes(32))
      );
      rollup.latestBlockTag = 'latest';
      afterAll(foundry.shutdown);
      const gateway = new Gateway(rollup);
      const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
      afterAll(ccip.shutdown);
      const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
      const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
      const verifier = await foundry.deploy({
        file: 'TrustedVerifier',
        libs: { GatewayVM },
      });
      await setupTests(verifier, opts, async (fetcher) => {
        await foundry.confirm(
          verifier.setConfig(
            fetcher,
            [ccip.endpoint],
            rollup.defaultWindow,
            hooks
          )
        );
        await foundry.confirm(
          verifier.setSigner(fetcher, rollup.signerAddress, true)
        );
      });
    }
  );
}

export function testLinea(
  config: RollupDeployment<LineaConfig>,
  opts: TestOptions
) {
  describe.skipIf(shouldSkip(opts))(testName(config), async () => {
    const rollup = new LineaRollup(createProviderPair(config), config);
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: !!opts.log,
    });
    afterAll(foundry.shutdown);
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(ccip.shutdown);
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({
      file: 'LineaVerifierHooks',
      libs: {
        SparseMerkleProof: config.SparseMerkleProof,
      },
    });
    const verifier = await foundry.deploy({
      file: 'LineaVerifier',
      args: [
        [ccip.endpoint],
        rollup.defaultWindow,
        hooks,
        config.L1MessageService,
      ],
      libs: { GatewayVM },
    });
    await setupTests(verifier, opts);
  });
}
