import type { RollupDeployment } from '../rollup.js';
import { ethers } from 'ethers';
import type { HexAddress, ProviderPair } from '../types.js';
import {
  ANCHOR_REGISTRY_ABI,
  DEFENDER_WINS,
  FACTORY_ABI,
  FAULT_GAME_ABI,
  GAME_ABI,
  PORTAL_ABI,
} from './types.js';
import {
  CHAIN_BASE_SEPOLIA,
  CHAIN_MAINNET,
  CHAIN_OP,
  CHAIN_SEPOLIA,
} from '../chains.js';
import { OPFaultGameFinder } from './OPFaultGameFinder.js';
import { AbstractOPRollup, type OPCommit } from './AbstractOPRollup.js';

export type OPFaultConfig = {
  OptimismPortal: HexAddress;
  OPFaultHelper: HexAddress;
};

const suggestedWindow = 5; // unit is games

export class OPFaultRollup extends AbstractOPRollup {
  static readonly mainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_OP,
    // https://docs.optimism.io/chain/addresses
    OptimismPortal: '0xbEb5Fc579115071764c7423A4f12eDde41f106Ed',
    // https://etherscan.io/address/0x6CbF8cd866a0FAE64b9C2B007D3D47c4E1B809fF
    OPFaultHelper: '0x6CbF8cd866a0FAE64b9C2B007D3D47c4E1B809fF',
    suggestedWindow,
  } as const;
  static readonly baseTestnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAIN_SEPOLIA,
    chain2: CHAIN_BASE_SEPOLIA,
    // https://docs.base.org/docs/base-contracts/#ethereum-testnet-sepolia
    OptimismPortal: '0x49f53e41452C74589E85cA1677426Ba426459e85',
    // https://sepolia.etherscan.io/address/0x5e43AB3442355fF1c045E5ECCB78e68e5838e219
    OPFaultHelper: '0x5e43AB3442355fF1c045E5ECCB78e68e5838e219',
    suggestedWindow,
  } as const;
  static async create(providers: ProviderPair, config: OPFaultConfig) {
    const { provider1 } = providers;
    const optimismPortal = new ethers.Contract(
      config.OptimismPortal,
      PORTAL_ABI,
      provider1
    );
    const [disputeGameFactoryAddress, respectedGameType] = await Promise.all([
      optimismPortal.disputeGameFactory(),
      optimismPortal.respectedGameType(),
    ]);
    const disputeGameFactory = new ethers.Contract(
      disputeGameFactoryAddress,
      FACTORY_ABI,
      provider1
    );
    const gameAddress = await disputeGameFactory.gameImpls(respectedGameType);
    const gameImpl = new ethers.Contract(
      gameAddress,
      FAULT_GAME_ABI,
      provider1
    );
    const anchorRegistryAddress = await gameImpl.anchorStateRegistry();
    const anchorRegistry = new ethers.Contract(
      anchorRegistryAddress,
      ANCHOR_REGISTRY_ABI,
      provider1
    );
    const gameFinder = new OPFaultGameFinder(
      disputeGameFactory,
      respectedGameType
    );
    return new this(providers, optimismPortal, gameFinder, anchorRegistry);
  }
  constructor(
    providers: ProviderPair,
    readonly OptimismPortal: ethers.Contract,
    readonly gameFinder: OPFaultGameFinder,
    readonly anchorRegistry: ethers.Contract
  ) {
    super(providers);
  }
  override async fetchLatestCommitIndex() {
    const { rootClaim } = await this.anchorRegistry.anchors(
      this.gameFinder.respectedGameType,
      {
        blockTag: 'finalized',
      }
    );
    const game = await this.gameFinder.findGameWithClaim(rootClaim);
    return game.index;
  }
  override async fetchParentCommitIndex(commit: OPCommit) {
    let index = commit.index - 1n;
    for (; index >= 0; index--) {
      const game = await this.gameFinder.findGameAtIndex(index);
      if (!game) continue;
      const disputeGame = new ethers.Contract(
        game.gameProxy,
        GAME_ABI,
        this.providers.provider1
      );
      const status = await disputeGame.status();
      if (status == DEFENDER_WINS) break;
    }
    return index;
  }
  override async fetchCommit(index: bigint) {
    const { gameType, gameProxy } =
      await this.gameFinder.disputeGameFactory.gameAtIndex(index);
    if (gameType != this.gameFinder.respectedGameType) {
      throw new Error(`Game(${index}) is not respected: GameType(${gameType})`);
    }
    const disputeGame = new ethers.Contract(
      gameProxy,
      GAME_ABI,
      this.providers.provider1
    );
    const [blockNumber, status] = await Promise.all([
      disputeGame.l2BlockNumber() as Promise<bigint>,
      disputeGame.status() as Promise<bigint>,
    ]);
    if (status != DEFENDER_WINS) {
      throw new Error(`Game(${index}) is not finalized: GameStatus(${status})`);
    }
    return this.createCommit(index, '0x' + blockNumber.toString(16));
  }
}
