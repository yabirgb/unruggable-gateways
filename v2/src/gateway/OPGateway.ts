import {ethers} from 'ethers';
import type {HexString} from '../types.js';
import {AbstractOPGateway, OPCommit, type AbstractOPGatewayConstructor} from './AbstractOPGateway.js';

type OPGatewayConstructor = {
	L2OutputOracle: HexString;
};

export class OPGateway extends AbstractOPGateway {
	static baseMainnet(a: AbstractOPGatewayConstructor) {
		// https://docs.base.org/docs/base-contracts
		return new this({
			L2OutputOracle: '0x56315b90c40730925ec5485cf004d835058518A0',
			...a
		});
	}
	readonly outputOracle: ethers.Contract;
	constructor(args: AbstractOPGatewayConstructor & OPGatewayConstructor) {
		super(args);
		this.outputOracle = new ethers.Contract(args.L2OutputOracle, [
			'function latestOutputIndex() external view returns (uint256)',
			'function getL2Output(uint256 outputIndex) external view returns (tuple(bytes32 outputRoot, uint128 t, uint128 block))',
		], this.provider1);
	}
	override async fetchLatestCommitIndex(): Promise<bigint> {
		return this.outputOracle.latestOutputIndex();
	}
	override async fetchCommit(index: bigint): Promise<OPCommit> {
		let output = await this.outputOracle.getL2Output(index) as {block: bigint};
		return this.createOPCommit(index, output.block);
	}
}
