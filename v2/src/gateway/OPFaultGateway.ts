import {ethers} from 'ethers';
import {CachedValue} from '../cached.js';
import type {HexString} from '../types.js';
import {AbstractOPGateway, OPCommit, type AbstractOPGatewayConstructor} from './AbstractOPGateway.js';

type OPFaultGatewayConstructor = {
	OptimismPortal: HexString;
};

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
		this.OptimismPortal = new ethers.Contract(args.OptimismPortal, [
			`function disputeGameFactory() external view returns (address)`,
			`function respectedGameType() external view returns (uint32)`,
		], this.provider1); 
		this.disputeGameFactory = CachedValue.once(async () => {
			let [factoryAddress, respectedGameType] = await Promise.all([
				this.OptimismPortal.disputeGameFactory(),
				this.OptimismPortal.respectedGameType(),
			]);
			let factory = new ethers.Contract(factoryAddress, [
				`function gameAtIndex(uint256 _index) external view returns (uint32 gameType, uint64 timestamp, address gameProxy)`,
				`function gameCount() external view returns (uint256 gameCount_)`,
				`function findLatestGames(uint32 gameType, uint256 _start, uint256 _n) external view returns (tuple(uint256 index, bytes32 metadata, uint64 timestamp, bytes32 rootClaim, bytes extraData)[] memory games_)`,
			], this.provider1);
			return {factory, respectedGameType};
		});
	}
	override async fetchLatestCommitIndex(): Promise<number> {
		let {factory} = await this.disputeGameFactory.get();
		let count = Number(await factory.gameCount());
		if (!count) throw new Error('no games');
		return count - 1;
	}
	override async fetchCommit(index: number): Promise<OPCommit> {
		let {factory, respectedGameType} = await this.disputeGameFactory.get();
		let {gameType, gameProxy} = await factory.gameAtIndex(index);
		if (gameType != respectedGameType) {
			throw new Error(`unrespected game type: ${gameType}`);
		}
		let game = new ethers.Contract(gameProxy, [
			'function l2BlockNumber() external view returns (uint256)',
			'function rootClaim() external view returns (bytes32)',
			'function status() external view returns (uint8)',
		], this.provider1);
		let [blockNumber, status] = await Promise.all([
			game.l2BlockNumber() as Promise<bigint>,
			game.status() as Promise<bigint>
		]);
		const CHALLENGER_WINS = 1n;
		if (status == CHALLENGER_WINS) {
			throw new Error('disputed game');
		}
		return this.createOPCommit(index, '0x' + blockNumber.toString(16));
	}

}
