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
	cache: CachedMap<string,any> | undefined;
	constructor(
		readonly index: number,
		readonly block: HexString,
		readonly blockHash: HexString,
	) {}
}

export type GatewayConstructor = {
	provider1: Provider; 
	provider2: Provider;
	errorRetryMs?: number;
	checkCommitMs?: number;
	writeCommitMs?: number;
	commitDepth?: number;
	commitStep?: number;
	commitDelay?: number;
	callCacheSize?: number;
	commitCacheSize?: number;
};

export abstract class AbstractGateway<C extends AbstractCommit> extends EZCCIP {
	readonly provider1;
	readonly provider2;
	readonly writeCommitMs;
	readonly commitStep;
	readonly commitDelay;
	readonly callCache: CachedMap<string, Uint8Array>;
	readonly commitCache: CachedMap<number, C>;
	readonly recentCommits: (C | undefined)[];
	readonly latestCache: CachedValue<number>;
	readonly commitCacheParams;
	constructor({
		provider1,
		provider2,
		   errorRetryMs = 250, // ms to wait to retry actions that failed
		  checkCommitMs = 60000, // how frequently to check if rollup has commit
		  writeCommitMs = 60*60000, // how frequently the rollup actually commits
		    commitDepth = 3, // how far back from head to support
		    commitDelay = 1, // offset from head for "latest" commit
		     commitStep = 1, // index rounding
		  callCacheSize = 1000, // typically 5-10KB per call
		commitCacheSize = 100000, // slots (bytes32), isContract (bool), proof? (bytes32x10?)
	}: GatewayConstructor) {
		super();
		this.provider1 = provider1;
		this.provider2 = provider2;
		this.writeCommitMs = writeCommitMs; // unused
		this.commitStep = commitStep;
		this.commitDelay = commitDelay * commitStep;
		this.commitCacheParams = {
			cacheMs: Infinity,
			errorMs: errorRetryMs,
			maxCached: commitCacheSize
		};
		this.latestCache = new CachedValue(async () => Number(await this.fetchLatestCommitIndex()), checkCommitMs, errorRetryMs); // cached
		this.recentCommits = Array(commitDepth); // circular buffer
		this.commitCache = new CachedMap({cacheMs: 0, errorMs: errorRetryMs, maxCached: 2*commitDepth}); // inflight commits
		this.callCache = new CachedMap({cacheMs: Infinity, maxCached: callCacheSize});
		this.register(`function proveRequest(bytes context, tuple(bytes ops, bytes[] inputs)) returns (bytes)`, async ([ctx, {ops, inputs}], context, history) => {
			let index = parseGatewayContext(ctx); // TODO: support (min, max)
			if (index % this.commitStep) throw new Error(`commit index not aligned: ${index}`);
			let hash = ethers.keccak256(context.calldata);
			history.show = [ethers.hexlify(ops), hash];
			return this.callCache.get(hash, async _ => {
				let commit = await this.commitFromAligned(index);
				let prover = new EVMProver(this.provider2, commit.block, commit.cache);
				let result = await prover.evalDecoded(ops, inputs);
				let {proofs, order} = await prover.prove(result.needs);
				return ethers.getBytes(this.encodeWitness(commit, proofs, order));
			});
		});
		this.register(`function getStorageSlots(address target, bytes32[] commands, bytes[] constants) returns (bytes)`, async ([target, commands, constants], context, history) => {
			let index = await this.getLatestCommitIndex();
			let hash = ethers.id(`${index}:${context.calldata}`);
			history.show = [hash];
			return this.callCache.get(hash, async _ => {
				let commit = await this.commitFromAligned(index);
				let prover = new EVMProver(this.provider2, commit.block, commit.cache);
				let req = new EVMRequestV1(target, commands, constants).v2(); // upgrade v1 to v2
				let state = await prover.evalRequest(req);
				let {proofs, order} = await prover.prove(state.needs);
				let witness = this.encodeWitnessV1(commit, proofs[order[0]], Array.from(order.subarray(1), i => proofs[i]));
				return ethers.getBytes(ABI_CODER.encode(['bytes'], [witness]));
			});
		});
	}
	get commitDepth() {
		return this.recentCommits.length;
	}
	shutdown() {
		this.provider1.destroy();
		this.provider2.destroy();
	}
	abstract fetchLatestCommitIndex(): Promise<number>;
	abstract fetchCommit(index: number): Promise<C>;
	abstract encodeWitnessV1(commit: C, accountProof: Proof, storageProofs: Proof[]): HexString;
	abstract encodeWitness(commit: C, proofs: Proof[], order: Uint8Array): HexString;
	// latest aligned commit index (cached)
	async getLatestCommitIndex() {
		return this.alignCommitIndex(await this.latestCache.get() - this.commitDelay);
	}
	// latest aligned commit (cached) 
	async getLatestCommit() {
		return this.commitFromAligned(await this.getLatestCommitIndex());
	}
	// align a commit index to cachable index
	// (typically the same unless rollup commits frequently, eg. scroll)
	protected alignCommitIndex(index: number) {
		return index - (index % this.commitStep);
	}
	// translate an aligned commit index to cicular buffer index
	// throws if the index is outside servable bounds
	private async slotFromAligned(index: number) {
		let latest = this.alignCommitIndex(await this.latestCache.get());
		if (index > latest) throw new Error(`commit too new: ${index} > ${latest}`);
		let oldest = latest - this.commitStep * this.recentCommits.length; 
		if (index < oldest) throw new Error(`commit too old: ${index} < ${oldest}`);
		return (index / this.commitStep) % this.recentCommits.length;
	}
	// manage circular buffer
	private async commitFromAligned(index: number) {
		let slot = await this.slotFromAligned(index); // compute circular index
		let commit = this.recentCommits[slot];
		if (commit?.index === index) return commit; // check if latest
		return this.commitCache.get(index, async index => {
			let commit = await this.fetchCommit(index); // get newer commit
			let slot = await this.slotFromAligned(index); // check slot again
			commit.cache = new CachedMap(this.commitCacheParams);
			this.recentCommits[slot] = commit; // replace
			return commit;
		});
	}
}

export function parseGatewayContext(context: HexString): number {
	let [index] = ABI_CODER.decode(['uint256'], context);
	return Number(index);
}
