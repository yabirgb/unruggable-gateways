import type {HexString, Proof, Provider} from '../types.js';
import {ethers} from 'ethers';
import {EZCCIP} from '@resolverworks/ezccip';
import {CachedMap, CachedValue} from '../cached.js';
import {EVMProver} from '../vm.js';
import {EVMRequestV1} from '../v1.js';

export const ABI_CODER = ethers.AbiCoder.defaultAbiCoder();
export function encodeProofV1(proof: Proof) {
	return ABI_CODER.encode(['bytes[]'], [proof]);
}

export class AbstractCommit {
	readonly slotCache: CachedMap<string, HexString> = new CachedMap();
	constructor(readonly index: bigint, readonly block: HexString) {}
}

export type GatewayConstructor = {
	provider1: Provider; 
	provider2: Provider;
	commitFreq?: number;
	commitDepth?: number;
	commitStep?: bigint;
	commitDelay?: bigint;
};

export abstract class AbstractGateway<C extends AbstractCommit> extends EZCCIP {
	readonly provider1;
	readonly provider2;
	readonly commitFreq;
	readonly commitStep;
	readonly commitDelay;
	readonly callCache: CachedMap<string, Uint8Array>;
	readonly commitCache: CachedMap<bigint, C>;
	readonly latestCache: CachedValue<bigint>;
	constructor({
		provider1,
		provider2,
		commitFreq = 60*60000,
		commitDepth = 10,
		commitStep = 1n,
		commitDelay = 1n,
	}: GatewayConstructor) {
		super();
		this.provider1 = provider1;
		this.provider2 = provider2;
		this.commitFreq = commitFreq;
		this.commitStep = commitStep;
		this.commitDelay = commitDelay;
		this.latestCache = new CachedValue(async () => this.fetchLatestCommitIndex(), this.commitFreq/60, 1000);
		this.callCache = new CachedMap({max_cached: 1000});
		this.commitCache = new CachedMap({ms: this.commitFreq, max_cached: commitDepth});
		this.register(`function proveRequest(bytes context, tuple(bytes ops, bytes[] inputs)) returns (bytes)`, async ([ctx, {ops, inputs}], context, history) => {
			let index = parseGatewayContext(ctx);
			let hash = ethers.keccak256(context.calldata);
			history.show = [ethers.hexlify(ops), hash]; // decide this
			return this.callCache.get(hash, async _ => {
				let commit = await this.commitCache.peek(index);
				if (!commit) {
					let latest = await this.getLatestCommitIndex();
					let lag = Number((latest - index) / this.commitStep);
					if (lag < -1) throw new Error(`too new: ${index} is ${lag} from ${latest}`);
					if (lag > this.commitDepth) throw new Error(`too old: ${index} is +${lag} from ${latest}`)
					commit = await this.getCommit(index);
				}
				let prover = new EVMProver(this.provider2, commit.block, commit.slotCache);
				//prover.log = console.log;
				let result = await prover.evalDecoded(ops, inputs);
				//console.log(result);
				let {proofs, order} = await prover.prove(result.needs);
				return ethers.getBytes(this.encodeWitness(commit, proofs, order));
			});
		});
		this.register(`function getStorageSlots(
			address target,
			bytes32[] commands,
			bytes[] constants
		) returns (bytes)`, async ([target, commands, constants], context, history) => {
			let index = await this.getLatestCommitIndex() - this.commitDelay;
			let hash = ethers.id(`${index}:${context.calldata}`);
			history.show = [hash];
			return this.callCache.get(hash, async _ => {
				let commit = await this.getCommit(index);
				let prover = new EVMProver(this.provider2, commit.block, commit.slotCache);
				let req = new EVMRequestV1(target, commands, constants).v2();
				let state = await prover.evalRequest(req);
				let {proofs, order} = await prover.prove(state.needs);
				let witness = this.encodeWitnessV1(commit, proofs[order[0]], Array.from(order.subarray(1), i => proofs[i]));
				return ethers.getBytes(ABI_CODER.encode(['bytes'], [witness]));
			});
		});
	}
	get commitDepth() {
		return this.commitCache.maxCached;
	}
	shutdown() {
		this.provider1.destroy();
		this.provider2.destroy();
	}
	abstract fetchLatestCommitIndex(): Promise<bigint>;
	abstract fetchCommit(index: bigint): Promise<C>;
	abstract encodeWitnessV1(commit: C, accountProof: Proof, storageProofs: Proof[]): HexString;
	abstract encodeWitness(commit: C, proofs: Proof[], order: Uint8Array): HexString;
	async getLatestCommitIndex() {
		let index = await this.latestCache.get();
		return index - (index % this.commitStep);
	}
	async getCommit(index: bigint) {
		return this.commitCache.get(index, async index => this.fetchCommit(index));
	}
	async getLatestCommit() {
		return this.getCommit(await this.getLatestCommitIndex());
	}
	async createLatestProvider() {
		let commit = await this.getLatestCommit();
		return new EVMProver(this.provider2, commit.block, commit.slotCache);
	}
}

export function parseGatewayContext(context: HexString): bigint {
	let [index] = ABI_CODER.decode(['uint256'], context);
	return index;
}
