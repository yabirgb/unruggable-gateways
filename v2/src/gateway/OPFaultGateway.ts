import { ethers } from 'ethers';
import { CachedMap, CachedValue } from '../cached.js';
import type { HexString } from '../types.js';
import {
  AbstractOPGateway,
  type AbstractOPGatewayConstructor,
} from './AbstractOPGateway.js';

// 20240701: what actually happens when a game is disputed?
// continually check the current game status?

// 20240724: example of disputed game, see test/debug/op-fault.md
// either we need 2 op-fault gateways: 1) uses "latest" commit that matches L2
// and 2) uses finality (T+7), or the op-fault gateway context needs to be sloppy
// so the gateway itself can ensure the commit is reasonable (eg. is a real root)
// possible temporary fix: use heuristic from starting block to detect outliers?

type OPFaultGatewayConstructor = {
  OptimismPortal: HexString;
};

const GAME_ABI = new ethers.Interface([
  'function l2BlockNumber() external view returns (uint256)',
  'function status() external view returns (uint8)',
  'function rootClaim() external view returns (bytes32)',
]);

const PORTAL_ABI = new ethers.Interface([
  `function disputeGameFactory() view returns (address)`,
  `function respectedGameType() view returns (uint32)`,
]);

const FACTORY_ABI = new ethers.Interface([
  `function gameAtIndex(uint256 _index) external view returns (uint32 gameType, uint64 timestamp, address gameProxy)`,
  `function gameCount() external view returns (uint256 gameCount_)`,
  `function findLatestGames(uint32 gameType, uint256 _start, uint256 _n) external view returns (tuple(uint256 index, bytes32 metadata, uint64 timestamp, bytes32 rootClaim, bytes extraData)[] memory games_)`,
  `function gameImpls(uint32 gameType) view returns (address)`,
]);

const DEFENDER_WINS = 2n;

type GameSearchResult = {
  index: bigint;
  metadata: HexString;
  timestamp: bigint;
  rootClaim: HexString;
  extraData: HexString;
};

export class OPFaultGameCache {
  readonly claimMap = new Map<HexString, GameSearchResult[]>();
  readonly resolvedMap;
  readonly updateCache;
  private lastCount = 0;
  constructor(
    readonly disputeGameFactory: ethers.Contract,
    readonly respectedGameType: bigint,
    cacheMs: number
  ) {
    this.resolvedMap = new CachedMap<HexString, GameSearchResult>({
      cacheMs: Infinity,
      errorMs: cacheMs,
    });
    this.updateCache = new CachedValue(async () => {
      const n = Number(await this.disputeGameFactory.gameCount());
      for (;;) {
        const chunk = Math.min(512, n - this.lastCount);
        if (!chunk) break;
        for (const res of await this.disputeGameFactory.findLatestGames(
          this.respectedGameType,
          this.lastCount + chunk - 1,
          chunk
        )) {
          const g: GameSearchResult = res.toObject();
          let bucket = this.claimMap.get(g.rootClaim);
          if (!bucket) {
            bucket = [];
            this.claimMap.set(g.rootClaim, bucket);
          }
          bucket.push(g);
        }
        this.lastCount += chunk;
      }
    }, cacheMs);
  }
  contractForGame(g: GameSearchResult) {
    const gameProxy = ethers.dataSlice(g.metadata, 12); // LibUDT.sol: [96, 256)
    return new ethers.Contract(
      gameProxy,
      GAME_ABI,
      this.disputeGameFactory.runner
    );
  }
  async findResolvedGameWithClaim(rootClaim: HexString) {
    return this.resolvedMap.get(rootClaim, async (rootClaim) => {
      await this.updateCache.get();
      const bucket = this.claimMap.get(rootClaim);
      if (!bucket) throw new Error('unknown claim');
      const vs = await Promise.all(
        bucket.map(async (g) => {
          const gameProxy = ethers.dataSlice(g.metadata, 12); // LibUDT.sol: [96, 256)
          const game = new ethers.Contract(
            gameProxy,
            GAME_ABI,
            this.disputeGameFactory.runner
          );
          return game.status() as Promise<bigint>;
        })
      );
      const index = vs.indexOf(DEFENDER_WINS);
      if (index == -1) throw new Error('not resolved yet');
      return bucket[index];
    });
  }
}

type GConstructor<T extends AbsG> = new (
  ...args: ConstructorParameters<typeof AbsG>
) => T;

abstract class AbsG extends AbstractOPGateway {
  static mainnet<T extends AbsG>(
    this: GConstructor<T>,
    a: AbstractOPGatewayConstructor
  ) {
    // https://docs.optimism.io/chain/addresses
    return new this({
      OptimismPortal: '0xbEb5Fc579115071764c7423A4f12eDde41f106Ed',
      ...a,
    });
  }
  static baseTestnet<T extends AbsG>(
    this: GConstructor<T>,
    a: AbstractOPGatewayConstructor
  ) {
    // https://docs.base.org/docs/base-contracts/#ethereum-testnet-sepolia
    return new this({
      OptimismPortal: '0x49f53e41452C74589E85cA1677426Ba426459e85',
      ...a,
    });
  }
  readonly OptimismPortal: ethers.Contract;
  constructor(args: AbstractOPGatewayConstructor & OPFaultGatewayConstructor) {
    super(args);
    this.requireNoStep(); // remove when faster than hourly
    this.OptimismPortal = new ethers.Contract(
      args.OptimismPortal,
      PORTAL_ABI,
      this.provider1
    );
  }
}

function isValidGameStatus(status: bigint) {
  const CHALLENGER_WINS = 1n;
  return status !== CHALLENGER_WINS;
}

export class OPFaultGateway extends AbsG {
  readonly onchainConfig: CachedValue<{
    factory: ethers.Contract;
    respectedGameType: bigint;
  }>;
  constructor(args: AbstractOPGatewayConstructor & OPFaultGatewayConstructor) {
    super(args);
    this.onchainConfig = CachedValue.once(async () => {
      const [factoryAddress, respectedGameType] = await Promise.all([
        this.OptimismPortal.disputeGameFactory(),
        this.OptimismPortal.respectedGameType(),
      ]);
      const factory = new ethers.Contract(
        factoryAddress,
        FACTORY_ABI,
        this.provider1
      );
      return { factory, respectedGameType };
    });
  }
  override async fetchLatestCommitIndex() {
    return this.findDelayedGameIndex(0);
  }
  override async fetchDelayedCommitIndex() {
    return this.findDelayedGameIndex(this.blockDelay);
  }
  override async fetchCommit(index: number) {
    const { factory, respectedGameType } = await this.onchainConfig.get();
    const { gameType, gameProxy } = await factory.gameAtIndex(index);
    if (gameType != respectedGameType) {
      throw new Error(`Game(${index}) is not respected: GameType(${gameType})`);
    }
    const game = new ethers.Contract(gameProxy, GAME_ABI, this.provider1);
    const [blockNumber, status] = await Promise.all([
      game.l2BlockNumber() as Promise<bigint>,
      game.status() as Promise<bigint>,
    ]);
    if (!isValidGameStatus(status)) {
      throw new Error(`Game(${game}) is disputed: GameStatus(${status})`);
    }
    return this.createOPCommit(index, '0x' + blockNumber.toString(16));
  }
  // mirror of OPFaultVerifier.sol:findDelayedGameIndex()
  async findDelayedGameIndex(blocks: number, gamesPerCall = 10) {
    const blockTag = (await this.provider1.getBlockNumber()) - blocks;
    const { factory, respectedGameType } = await this.onchainConfig.get();
    let count = Number(await factory.gameCount({ blockTag })); // faster than checking times
    while (count > 0) {
      for (const g of await factory.findLatestGames(
        respectedGameType,
        count - 1,
        gamesPerCall
      )) {
        --count;
        const gameProxy = ethers.dataSlice(g.metadata, 12); // LibUDT.sol: [96, 256)
        const game = new ethers.Contract(gameProxy, GAME_ABI, this.provider1);
        if (isValidGameStatus(await game.status())) {
          return Number(g.index);
        }
      }
    }
    return 0;
  }
}

export class FinalizedOPFaultGateway extends AbsG {
  readonly onchainConfig: CachedValue<{
    factory: ethers.Contract;
    gameImpl: ethers.Contract;
    gameCache: OPFaultGameCache;
    anchorRegistry: ethers.Contract;
    respectedGameType: bigint;
  }>;
  constructor(args: AbstractOPGatewayConstructor & OPFaultGatewayConstructor) {
    super(args);
    this.onchainConfig = CachedValue.once(async () => {
      const [factoryAddress, respectedGameType] = await Promise.all([
        this.OptimismPortal.disputeGameFactory(),
        this.OptimismPortal.respectedGameType(),
      ]);
      const factory = new ethers.Contract(
        factoryAddress,
        FACTORY_ABI,
        this.provider1
      );
      const gameCache = new OPFaultGameCache(
        factory,
        respectedGameType,
        this.latestCache.cacheMs
      );
      const gameImpl = new ethers.Contract(
        await factory.gameImpls(respectedGameType),
        [`function anchorStateRegistry() view returns (address)`],
        this.provider1
      );
      // https://etherscan.io/address/0x18DAc71c228D1C32c99489B7323d441E1175e443#readProxyContract
      const anchorRegistry = new ethers.Contract(
        await gameImpl.anchorStateRegistry(),
        [
          `function anchors(uint32 gameType) view returns (bytes32 rootClaim, uint256 l2BlockNumber)`,
        ],
        this.provider1
      );
      return {
        factory,
        gameCache,
        gameImpl,
        anchorRegistry,
        respectedGameType,
      };
    });
  }
  override async fetchLatestCommitIndex() {
    return this.findDelayedGameIndex(0);
  }
  override async fetchDelayedCommitIndex() {
    return this.findDelayedGameIndex(this.blockDelay);
  }
  override async fetchCommit(index: number) {
    const { factory, respectedGameType } = await this.onchainConfig.get();
    const { gameType, gameProxy } = await factory.gameAtIndex(index);
    if (gameType != respectedGameType) {
      throw new Error(`Game:${index} is not respected: GameType(${gameType})`);
    }
    const game = new ethers.Contract(gameProxy, GAME_ABI, this.provider1);
    const [blockNumber, status] = await Promise.all([
      game.l2BlockNumber() as Promise<bigint>,
      game.status() as Promise<bigint>,
    ]);
    if (status !== DEFENDER_WINS) {
      throw new Error(`Game:${index} not defended: GameStatus(${status})`);
    }
    return this.createOPCommit(index, '0x' + blockNumber.toString(16));
  }
  async findDelayedGameIndex(blocks: number) {
    const blockTag = (await this.provider1.getBlockNumber()) - blocks;
    const { anchorRegistry, respectedGameType, gameCache } =
      await this.onchainConfig.get();
    const { rootClaim } = await anchorRegistry.anchors(respectedGameType, {
      blockTag,
    });
    const game = await gameCache.findResolvedGameWithClaim(rootClaim);
    return Number(game.index);
  }
}
