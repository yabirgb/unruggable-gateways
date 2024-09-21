import type { ChainPair, HexAddress, ProviderPair } from '../../src/types.js';
import type { Rollup, RollupCommitType } from '../../src/rollup.js';
import { Foundry } from '@adraffy/blocksmith';
import { chainName, createProvider, providerURL } from '../providers.js';
import { deployProxy } from '../gateway/common.js';
import { Contract } from 'ethers';
import { GatewayRequest } from '../../src/vm.js';
import { ABI_CODER } from '../../src/utils.js';
import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { LineaRollup } from '../../src/linea/LineaRollup.js';
import { ScrollRollup } from '../../src/scroll/ScrollRollup.js';
import { ZKSyncRollup } from '../../src/zksync/ZKSyncRollup.js';
import { TaikoRollup } from '../../src/taiko/TaikoRollup.js';

async function createEstimator<R extends Rollup>(
  proxy: Contract,
  rollup: R,
  commit?: RollupCommitType<R>
) {
  commit ??= await rollup.fetchLatestCommit();
  return async (req: GatewayRequest) => {
    const state = await commit.prover.evalRequest(req);
    const values = await state.resolveOutputs();
    const proofSeq = await commit.prover.prove(state.needs);
    const witness = rollup.encodeWitness(commit, proofSeq);
    const context = ABI_CODER.encode(['uint256'], [commit.index]);
    const gas = await proxy.getStorageValues.estimateGas(
      context,
      req.toTuple(),
      witness
    );
    return { req, state, values, gas };
  };
}

type Setup = (
  launch: (
    fn: ChainPair
  ) => Promise<{ foundry: Foundry; providers: ProviderPair }>
) => Promise<{
  config: ChainPair;
  estimator: Awaited<ReturnType<typeof createEstimator>>;
  addresses: {
    USDC: HexAddress;
    SlotData: HexAddress;
  };
}>;

const setups: Setup[] = [
  async (launch) => {
    const config = OPFaultRollup.mainnetConfig;
    const { foundry, providers } = await launch(config);
    const rollup = new OPFaultRollup(providers, config);
    const commit = await rollup.fetchLatestCommit();
    const gameFinder = await foundry.deploy({
      file: 'FixedOPFaultGameFinder',
      args: [commit.index],
    });
    const verifier = await foundry.deploy({
      file: 'OPFaultVerifier',
      args: [gameFinder],
    });
    const proxy = await deployProxy(foundry, verifier);
    await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
    await foundry.confirm(proxy.setPortal(rollup.OptimismPortal));
    const estimator = await createEstimator(proxy, rollup, commit);
    return {
      config,
      estimator,
      addresses: {
        USDC: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
        SlotData: '0xf9d79d8c09d24e0C47E32778c830C545e78512CF',
      },
    };
  },
  async (launch) => {
    const config = LineaRollup.mainnetConfig;
    const { foundry, providers } = await launch(config);
    const rollup = new LineaRollup(providers, config);
    const verifier = await foundry.deploy({
      file: 'LineaVerifier',
      libs: {
        SparseMerkleProof: config.SparseMerkleProof,
      },
    });
    const proxy = await deployProxy(foundry, verifier);
    await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
    await foundry.confirm(proxy.setRollup(rollup.L1MessageService));
    const estimator = await createEstimator(proxy, rollup);
    return {
      config,
      estimator,
      addresses: {
        USDC: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
        SlotData: '0x48F5931C5Dbc2cD9218ba085ce87740157326F59',
      },
    };
  },
  async (launch) => {
    const config = ZKSyncRollup.mainnetConfig;
    const { foundry, providers } = await launch(config);
    const rollup = new ZKSyncRollup(providers, config);
    const smt = await foundry.deploy({ file: 'ZKSyncSMT' });
    const verifier = await foundry.deploy({
      file: 'ZKSyncVerifier',
      args: [smt],
    });
    const proxy = await deployProxy(foundry, verifier);
    await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
    await foundry.confirm(proxy.setDiamond(rollup.DiamondProxy));
    const estimator = await createEstimator(proxy, rollup);
    return {
      config,
      estimator,
      addresses: {
        USDC: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4',
        SlotData: '0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc',
      },
    };
  },
  async (launch) => {
    const config = ScrollRollup.mainnetConfig;
    const { foundry, providers } = await launch(config);
    const rollup = await ScrollRollup.create(providers, config);
    const verifier = await foundry.deploy({ file: 'ScrollVerifier' });
    const proxy = await deployProxy(foundry, verifier);
    await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
    await foundry.confirm(
      proxy.setCommitmentVerifier(rollup.CommitmentVerifier)
    );
    const estimator = await createEstimator(proxy, rollup);
    return {
      config,
      estimator,
      addresses: {
        USDC: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4',
        SlotData: '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF',
      },
    };
  },
  async (launch) => {
    const config = TaikoRollup.mainnetConfig;
    const { foundry, providers } = await launch(config);
    const rollup = await TaikoRollup.create(providers, config);
    const verifier = await foundry.deploy({ file: 'TaikoVerifier' });
    const proxy = await deployProxy(foundry, verifier);
    await foundry.confirm(proxy.setWindow(rollup.defaultWindow));
    await foundry.confirm(proxy.setRollup(rollup.TaikoL1));
    const estimator = await createEstimator(proxy, rollup);
    return {
      config,
      estimator,
      addresses: {
        USDC: '0x07d83526730c7438048D55A4fc0b850e2aaB6f0b',
        SlotData: '0xAF7f1Fa8D5DF0D9316394433E841321160408565',
      },
    };
  },
];

const SLOT_LIKELY_ZERO = '0x'.padEnd(66, 'F');
for (const setup of setups) {
  let foundry: Foundry | undefined;
  try {
    const { config, estimator, addresses } = await setup(async (chains) => {
      foundry = await Foundry.launch({
        infoLog: false,
        fork: providerURL(chains.chain1),
      });
      return {
        foundry,
        providers: {
          provider1: foundry.provider,
          provider2: createProvider(chains.chain2),
        },
      };
    });

    // TODO: USDC is a big trie, use addresses.SlotData for a small trie
    const proveState = await estimator(new GatewayRequest());
    const proveAccount = await estimator(
      new GatewayRequest().setTarget(addresses.USDC).requireContract()
    );
    const proveOwnerReq = await estimator(
      new GatewayRequest(1)
        .setTarget(addresses.USDC)
        .requireContract()
        .setSlot(0)
        .read()
        .setOutput(0)
    );
    const proveOwner = await estimator(
      new GatewayRequest(1)
        .setTarget(addresses.USDC)
        .setSlot(0)
        .read()
        .setOutput(0)
    );
    const proveZero = await estimator(
      new GatewayRequest(1)
        .setTarget(addresses.USDC)
        .setSlot(SLOT_LIKELY_ZERO)
        .read()
        .setOutput(0)
    ).catch((err) => {
      // 20240921: this shouldn't happen but theres some verifier issues
      // scroll cant prove a zero
      // linea cant prove some zeros
      return err.shortMessage ?? err.message ?? 'unknown error';
    });

    // if there is only 1 trie, proving storage doesn't require an account proof (eg. ZKSync)
    const accountGas =
      proveOwnerReq.gas - proveOwner.gas > 50000
        ? proveState.gas
        : proveAccount.gas;

    console.log({
      name: chainName(config.chain2),
      rollup: proveState.gas,
      account: proveAccount.gas - proveState.gas,
      storage1: proveOwner.gas - accountGas,
      storage0:
        typeof proveZero === 'string' ? proveZero : proveZero.gas - accountGas,
    });
  } catch (err) {
    console.log(err);
  }
  await foundry?.shutdown();
}

// {
// 	name: "op<10>",
// 	rollup: 70839n,
// 	account: 322166n,
// 	storage1: 277053n,
// 	storage0: 209320n,
// }
// {
// 	name: "linea<59144>",
// 	rollup: 54014n,
// 	account: 1410852n,
// 	storage1: 1368510n,
// 	storage0: "execution reverted (unknown custom error)",
// }
// {
// 	name: "zksync<324>",
// 	rollup: 64150n,
// 	account: 12839783n,
// 	storage1: 12843289n,
// 	storage0: 12848115n,
// }
// {
// 	name: "scroll<534352>",
// 	rollup: 57153n,
// 	account: 1213599n,
// 	storage1: 830569n,
// 	storage0: "execution reverted (unknown custom error)",
// }
// {
// 	name: "taiko<167000>",
// 	rollup: 69045n,
// 	account: 278172n,
// 	storage1: 239809n,
// 	storage0: 191864n,
// }
