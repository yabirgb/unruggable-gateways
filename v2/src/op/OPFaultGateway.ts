import {
  AbstractOPGateway,
  type AbstractOPGatewayConstructor,
} from './AbstractOPGateway.js';
import { ethers } from 'ethers';
import type { HexAddress } from '../types.js';
import {
  PORTAL_ABI,
  HELPER_ABI,
  FACTORY_ABI,
  GAME_ABI,
  DEFENDER_WINS,
} from './types.js';
import { CachedValue } from '../cached.js';
import {
  CHAIN_BASE_SEPOLIA,
  CHAIN_MAINNET,
  CHAIN_OP,
  CHAIN_SEPOLIA,
} from '../chains.js';
import type { GatewayConfig } from '../AbstractGateway.js';

// 20240701: what actually happens when a game is disputed?
// continually check the current game status?

// 20240724: example of disputed game, see test/debug/op-fault.md
// either we need 2 op-fault gateways: 1) uses "latest" commit that matches L2
// and 2) uses finality (T+7), or the op-fault gateway context needs to be sloppy
// so the gateway itself can ensure the commit is reasonable (eg. is a real root)
// possible temporary fix: use heuristic from starting block to detect outliers?

// 20240810: each player gets half of the clock, so uncontested finality is T+3.5

type Constructor = {
  OptimismPortal: HexAddress;
  OPFaultHelper: HexAddress;
};

export class OPFaultGateway extends AbstractOPGateway {
  static readonly mainnetConfig: GatewayConfig<Constructor> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_OP,
    // https://docs.optimism.io/chain/addresses
    OptimismPortal: '0xbEb5Fc579115071764c7423A4f12eDde41f106Ed',
    // https://etherscan.io/address/0x6CbF8cd866a0FAE64b9C2B007D3D47c4E1B809fF
    OPFaultHelper: '0x6CbF8cd866a0FAE64b9C2B007D3D47c4E1B809fF',
  };
  static readonly baseTestnetConfig: GatewayConfig<Constructor> = {
    chain1: CHAIN_SEPOLIA,
    chain2: CHAIN_BASE_SEPOLIA,
    // https://docs.base.org/docs/base-contracts/#ethereum-testnet-sepolia
    OptimismPortal: '0x49f53e41452C74589E85cA1677426Ba426459e85',
    // https://sepolia.etherscan.io/address/0x5e43AB3442355fF1c045E5ECCB78e68e5838e219
    OPFaultHelper: '0x5e43AB3442355fF1c045E5ECCB78e68e5838e219',
  };
  readonly OPFaultHelper;
  readonly OptimismPortal;
  readonly onchainConfig: CachedValue<{
    factory: ethers.Contract;
    respectedGameType: bigint;
  }>;
  constructor(args: AbstractOPGatewayConstructor & Constructor) {
    super(args);
    this.OptimismPortal = new ethers.Contract(
      args.OptimismPortal,
      PORTAL_ABI,
      this.provider1
    );
    this.OPFaultHelper = new ethers.Contract(
      args.OPFaultHelper,
      HELPER_ABI,
      this.provider1
    );
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
  override async fetchLatestCommitIndex(blockDelay: number) {
    return Number(
      await this.OPFaultHelper.findDelayedGameIndex(
        this.OptimismPortal,
        blockDelay * 12
      )
    );
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
    // https://github.com/ethereum-optimism/optimism/blob/773e476b18ed6004aa7dade19a55519deb188942/packages/contracts-bedrock/src/dispute/lib/Types.sol#L7
    if (status != DEFENDER_WINS) {
      throw new Error(`Game(${game}) is not finalized: GameStatus(${status})`);
    }
    return this.createOPCommit(index, '0x' + blockNumber.toString(16));
  }
}
