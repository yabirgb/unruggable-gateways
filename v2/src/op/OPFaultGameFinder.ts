import { CachedMap, CachedValue } from '../cached.js';
import type { HexAddress, HexString, HexString32 } from '../types.js';
import { GAME_ABI, DEFENDER_WINS } from './types.js';
import { ethers } from 'ethers';

type ABIGameSearchResult = {
  index: bigint;
  metadata: HexString;
  timestamp: bigint;
  rootClaim: HexString;
  extraData: HexString;
};

type KnownGame = {
  index: bigint;
  rootClaim: HexString32;
  gameProxy: HexAddress;
};

export class OPFaultGameFinder {
  private lastCount = 0;
  readonly claimMap = new Map<HexString, KnownGame[]>();
  readonly indexMap = new Map<bigint, KnownGame>();
  readonly finalizedMap = new CachedMap<HexString, KnownGame>(0);
  readonly searchGuard = new CachedValue(async () => {
    const n = Number(await this.disputeGameFactory.gameCount());
    for (;;) {
      const chunk = Math.min(512, n - this.lastCount);
      if (!chunk) break;
      for (const res of (await this.disputeGameFactory.findLatestGames(
        this.respectedGameType,
        this.lastCount + chunk - 1,
        chunk
      )) as ABIGameSearchResult[]) {
        const game: KnownGame = {
          index: res.index,
          gameProxy: ethers.dataSlice(res.metadata, 12), // LibUDT.sol: [96, 256)
          rootClaim: res.rootClaim,
        };
        let bucket = this.claimMap.get(res.rootClaim);
        if (!bucket) {
          bucket = [];
          this.claimMap.set(res.rootClaim, bucket);
        }
        this.indexMap.set(game.index, game);
        bucket.push(game);
      }
      this.lastCount += chunk;
    }
  });
  constructor(
    readonly disputeGameFactory: ethers.Contract,
    readonly respectedGameType: bigint
  ) {}
  async findGameAtIndex(index: bigint) {
    await this.searchGuard.get();
    return this.indexMap.get(index);
  }
  async findGameWithClaim(rootClaim: HexString32) {
    return this.finalizedMap.get(rootClaim, async (rootClaim) => {
      await this.searchGuard.get();
      const bucket = this.claimMap.get(rootClaim);
      if (!bucket) throw new Error(`unknown claim: ${rootClaim}`);
      const v = await Promise.all(
        bucket.map((game) =>
          new ethers.Contract(
            game.gameProxy,
            GAME_ABI,
            this.disputeGameFactory.runner
          ).status()
        )
      );
      const i = v.indexOf(DEFENDER_WINS);
      if (i < 0) throw new Error('not finalized yet');
      // this.claimMap.delete(rootClaim);
      return bucket[i];
    });
  }
}
