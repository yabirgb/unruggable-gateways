import { ethers } from 'ethers';
import { CachedValue } from '../cached.js';
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
  readonly OptimismPortal: ethers.Contract;
  readonly disputeGameFactory: CachedValue<{
    factory: ethers.Contract;
    respectedGameType: bigint;
  }>;
  constructor(args: AbstractOPGatewayConstructor & OPFaultGatewayConstructor) {
    super(args);
    this.requireNoStep(); // remove when faster than hourly
    this.OptimismPortal = new ethers.Contract(
      args.OptimismPortal,
      [
        `function disputeGameFactory() external view returns (address)`,
        `function respectedGameType() external view returns (uint32)`,
      ],
      this.provider1
    );
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
  override async fetchLatestCommitIndex() {
    return this.findDelayedGameIndex(0);
  }
  override async fetchDelayedCommitIndex() {
    return this.findDelayedGameIndex(this.blockDelay);
  }
  override async fetchCommit(index: number) {
    const { factory, respectedGameType } = await this.disputeGameFactory.get();
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
    const { factory, respectedGameType } = await this.disputeGameFactory.get();
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
