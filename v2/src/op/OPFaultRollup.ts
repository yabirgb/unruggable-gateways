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

// https://docs.optimism.io/chain/differences
// https://specs.optimism.io/fault-proof/stage-one/bridge-integration.html

export type OPFaultConfig = {
  OptimismPortal: HexAddress;
  // known game types sorted by priority
  gameTypes: bigint[];
};

export type SupportedGame = {
  readonly gameImpl: ethers.Contract;
  readonly anchorRegistry: ethers.Contract;
  readonly gameFinder: OPFaultGameFinder;
};

export class OPFaultRollup extends AbstractOPRollup {
  static readonly mainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_OP,
    // https://docs.optimism.io/chain/addresses
    OptimismPortal: '0xbEb5Fc579115071764c7423A4f12eDde41f106Ed',
    gameTypes: [1n, 0n],
    // https://etherscan.io/address/0x6CbF8cd866a0FAE64b9C2B007D3D47c4E1B809fF
    //OPFaultHelper: '0x6CbF8cd866a0FAE64b9C2B007D3D47c4E1B809fF',
  } as const;
  static readonly baseTestnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAIN_SEPOLIA,
    chain2: CHAIN_BASE_SEPOLIA,
    // https://docs.base.org/docs/base-contracts/#ethereum-testnet-sepolia
    OptimismPortal: '0x49f53e41452C74589E85cA1677426Ba426459e85',
    // https://sepolia.etherscan.io/address/0x5e43AB3442355fF1c045E5ECCB78e68e5838e219
    //OPFaultHelper: '0x5e43AB3442355fF1c045E5ECCB78e68e5838e219',
    gameTypes: [1n, 0n],
  } as const;

  static async create(providers: ProviderPair, config: OPFaultConfig) {
    const optimismPortal = new ethers.Contract(
      config.OptimismPortal,
      PORTAL_ABI,
      providers.provider1
    );
    const factoryAddress: HexAddress =
      await optimismPortal.disputeGameFactory();
    const disputeGameFactory = new ethers.Contract(
      factoryAddress,
      FACTORY_ABI,
      providers.provider1
    );
    const games: SupportedGame[] = await Promise.all(
      config.gameTypes.map(async (gt) => {
        const gameAddress: HexAddress = await disputeGameFactory.gameImpls(gt);
        const gameImpl = new ethers.Contract(
          gameAddress,
          FAULT_GAME_ABI,
          providers.provider1
        );
        // in general, cannot assume every game have the same registry
        // 20240819: they are the same
        const anchorRegistryAddress = await gameImpl.anchorStateRegistry();
        const anchorRegistry = new ethers.Contract(
          anchorRegistryAddress,
          ANCHOR_REGISTRY_ABI,
          providers.provider1
        );
        const gameFinder = new OPFaultGameFinder(disputeGameFactory, gt);
        return {
          gameImpl,
          anchorRegistry,
          gameFinder,
        };
      })
    );
    return new this(providers, optimismPortal, disputeGameFactory, games);
  }
  private constructor(
    providers: ProviderPair,
    readonly OptimismPortal: ethers.Contract,
    readonly disputeGameFactory: ethers.Contract,
    readonly supportedGames: SupportedGame[]
    //readonly anchorRegistry: ethers.Contract
    //readonly gameImpl: ethers.Contract
  ) {
    super(providers);
  }

  get gameTypes() {
    return this.supportedGames.reduce(
      (a, x) => a | (1n << x.gameFinder.gameType),
      0n
    );
  }
  async fetchGameType(): Promise<bigint> {
    return this.OptimismPortal.respectedGameType({ blockTag: 'finalized' });
  }

  private async ensureFinalizedGame(index: bigint) {
    const game = await Promise.any(
      this.supportedGames.map((g) => g.gameFinder.findGameAtIndex(index))
    );
    const contract = new ethers.Contract(
      game.address,
      GAME_ABI,
      this.provider1
    );
    const status: bigint = await contract.status();
    if (status != DEFENDER_WINS) {
      throw new Error(`Game(${index}) is not finalized: GameStatus(${status})`);
    }
    return { game, contract };
  }

  override async fetchLatestCommitIndex() {
    const games = await Promise.all(
      this.supportedGames.map(async (game) => {
        const { rootClaim } = await game.anchorRegistry.anchors(
          game.gameFinder.gameType,
          {
            blockTag: 'finalized',
          }
        );
        return game.gameFinder.findGameWithClaim(rootClaim).catch(() => {});
      })
    );
    const game = games.reduce((best, g) =>
      g && (!best || g.blockNumber > best.blockNumber) ? g : best
    );
    if (!game) throw new Error('no game');
    //console.log(game);
    return game.index;
  }
  override async fetchParentCommitIndex(commit: OPCommit) {
    let index = commit.index;
    while (index) {
      try {
        await this.ensureFinalizedGame(--index);
        return index;
      } catch (err) {
        /* empty */
      }
    }
    return -1n;
  }
  override async fetchCommit(index: bigint) {
    const { game } = await this.ensureFinalizedGame(index);
    return this.createCommit(index, '0x' + game.blockNumber.toString(16));
  }

  override windowFromSec(sec: number): number {
    // finalization time is on-chain
    // https://github.com/ethereum-optimism/optimism/blob/a81de910dc2fd9b2f67ee946466f2de70d62611a/packages/contracts-bedrock/src/dispute/FaultDisputeGame.sol#L590
    return sec;
  }
}
