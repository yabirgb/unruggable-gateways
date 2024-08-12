import { CachedMap, CachedValue } from '../cached.js';
import type { HexAddress, HexString, Provider } from '../types.js';
import { delayedBlockTag } from '../utils.js';
import {
  FACTORY_ABI,
  GAME_ABI,
  PORTAL_ABI,
  FAULT_GAME_ABI,
  ANCHOR_REGISTRY_ABI,
  DEFENDER_WINS,
} from './types.js';
import { ethers } from 'ethers';

type GameSearchResult = {
  index: bigint;
  metadata: HexString;
  timestamp: bigint;
  rootClaim: HexString;
  extraData: HexString;
};

export class OPFaultHelper {
  static async fromPortal(provider: Provider, OptimismPortal: HexAddress) {
    const optimismPortal = new ethers.Contract(
      OptimismPortal,
      PORTAL_ABI,
      provider
    );
    const [factoryAddress, respectedGameType] = await Promise.all([
      optimismPortal.disputeGameFactory(),
      optimismPortal.respectedGameType(),
    ]);
    const disputeGameFactory = new ethers.Contract(
      factoryAddress,
      FACTORY_ABI,
      provider
    );
    return this.fromFactory(disputeGameFactory, respectedGameType);
  }
  static async fromFactory(
    disputeGameFactory: ethers.Contract,
    respectedGameType: bigint
  ) {
    const gameImpl = new ethers.Contract(
      await disputeGameFactory.gameImpls(respectedGameType),
      FAULT_GAME_ABI,
      disputeGameFactory.runner
    );
    // https://etherscan.io/address/0x18DAc71c228D1C32c99489B7323d441E1175e443#readProxyContract
    const anchorRegistry = new ethers.Contract(
      await gameImpl.anchorStateRegistry(),
      ANCHOR_REGISTRY_ABI,
      disputeGameFactory.runner
    );
    const gameCache = new OPFaultGameCache(
      disputeGameFactory,
      respectedGameType
    );
    return new this(anchorRegistry, gameCache);
  }
  constructor(
    readonly anchorRegistry: ethers.Contract,
    readonly gameCache: OPFaultGameCache
  ) {}
  get provider() {
    return this.anchorRegistry.runner!.provider!;
  }
  async fetchDelayedGameIndex(blockDelay: number) {
    const blockTag = await delayedBlockTag(this.provider, blockDelay);
    const { rootClaim } = await this.anchorRegistry.anchors(
      this.gameCache.respectedGameType,
      {
        blockTag,
      }
    );
    const game = await this.gameCache.findResolvedGameWithClaim(rootClaim);
    return game.index;
  }
}

export class OPFaultGameCache {
  readonly claimMap = new Map<HexString, GameSearchResult[]>();
  readonly resolvedMap;
  readonly updateCache;
  private lastCount = 0;
  constructor(
    readonly disputeGameFactory: ethers.Contract,
    readonly respectedGameType: bigint,
    cacheMs = 30000
  ) {
    this.resolvedMap = new CachedMap<HexString, GameSearchResult>({
      cacheMs: Infinity,
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
  private contractFrom(g: GameSearchResult) {
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
          return this.contractFrom(g).status() as Promise<bigint>;
        })
      );
      const index = vs.indexOf(DEFENDER_WINS);
      if (index == -1) throw new Error('not resolved yet');
      return bucket[index];
    });
  }
}
