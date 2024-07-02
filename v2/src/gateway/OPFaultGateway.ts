import { ethers } from 'ethers';
import { CachedValue } from '../cached.js';
import type { HexString } from '../types.js';
import {
  AbstractOPGateway,
  OPCommit,
  type AbstractOPGatewayConstructor,
} from './AbstractOPGateway.js';

// what actually happens when a game is disputed?
// continually check the current game status?

type OPFaultGatewayConstructor = {
  OptimismPortal: HexString;
};

const GAME_ABI = new ethers.Interface([
  'function l2BlockNumber() external view returns (uint256)',
  'function status() external view returns (uint8)',
  //'function rootClaim() external view returns (bytes32)',
]);

function isValidGameStatus(status: bigint) {
  const CHALLENGER_WINS = 1n;
  return status !== CHALLENGER_WINS;
}

export class OPFaultGateway extends AbstractOPGateway {
  static mainnet(a: AbstractOPGatewayConstructor) {
    // https://docs.optimism.io/chain/addresses
    return new this({
      OptimismPortal: '0xbEb5Fc579115071764c7423A4f12eDde41f106Ed',
      ...a,
    });
  }
  //readonly latestRespectedCache;
  readonly OptimismPortal: ethers.Contract;
  readonly disputeGameFactory: CachedValue<{
    factory: ethers.Contract;
    respectedGameType: bigint;
  }>;
  constructor(args: AbstractOPGatewayConstructor & OPFaultGatewayConstructor) {
    super(args);
    this.OptimismPortal = new ethers.Contract(
      args.OptimismPortal,
      [
        `function disputeGameFactory() external view returns (address)`,
        `function respectedGameType() external view returns (uint32)`,
      ],
      this.provider1
    );
    // this.latestRespectedCache = new CachedValue(async () => {
    // 	let {index} = await this.findLatestGame(this.commitDelay);
    // 	return index;
    // }, this.latestCache.cacheMs, this.latestCache.errorMs);
    this.disputeGameFactory = CachedValue.once(async () => {
      const [factoryAddress, respectedGameType] = await Promise.all([
        this.OptimismPortal.disputeGameFactory(),
        this.OptimismPortal.respectedGameType(),
      ]);
      const factory = new ethers.Contract(
        factoryAddress,
        [
          `function gameAtIndex(uint256 _index) external view returns (uint32 gameType, uint64 timestamp, address gameProxy)`,
          `function gameCount() external view returns (uint256 gameCount_)`,
          `function findLatestGames(uint32 gameType, uint256 _start, uint256 _n) external view returns (tuple(uint256 index, bytes32 metadata, uint64 timestamp, bytes32 rootClaim, bytes extraData)[] memory games_)`,
        ],
        this.provider1
      );
      return { factory, respectedGameType };
    });
  }
  override async fetchLatestCommitIndex(): Promise<number> {
    // TODO: if we have an on-chain verifier, we can just call findLatestGame()
    const { factory } = await this.disputeGameFactory.get();
    const count = Number(await factory.gameCount());
    if (!count) throw new Error('no games');
    return count - 1;
  }
  override async fetchCommit(index: number): Promise<OPCommit> {
    const { factory, respectedGameType } = await this.disputeGameFactory.get();
    const { gameType, gameProxy } = await factory.gameAtIndex(index);
    if (gameType != respectedGameType) {
      throw new Error(`unrespected game type: ${gameType}`);
    }
    const game = new ethers.Contract(gameProxy, GAME_ABI, this.provider1);
    const [blockNumber, status] = await Promise.all([
      game.l2BlockNumber() as Promise<bigint>,
      game.status() as Promise<bigint>,
    ]);
    if (!isValidGameStatus(status)) {
      throw new Error('disputed game');
    }
    return this.createOPCommit(index, '0x' + blockNumber.toString(16));
  }
  // override async getLatestCommitIndex() {
  // 	return this.alignCommitIndex(await this.latestRespectedCache.get());
  // }
  async findLatestGame(delay = 0) {
    // mirror of OPFaultVerifier.sol:findLatestGame()
    const { factory, respectedGameType } = await this.disputeGameFactory.get();
    const count = Number(await factory.gameCount());
    let left = count - delay;
    while (left > 0) {
      for (const g of await factory.findLatestGames(
        respectedGameType,
        left - 1,
        10
      )) {
        --left;
        const gameProxy = ethers.dataSlice(g.metadata, 12); // LibUDT.sol: [96, 256)
        const game = new ethers.Contract(gameProxy, GAME_ABI, this.provider1);
        if (isValidGameStatus(await game.status())) {
          return { count, index: Number(g.index) };
        }
      }
    }
    throw new Error('no games');
  }
}
