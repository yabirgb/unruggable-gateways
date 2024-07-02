// CachedMap maintains 2 maps:
// 1) pending promises by key
// 2) settled promises by key + expiration
// requests for the same key return the same promise
// which may be from (1) or (2)
// too many pending {max_pending} are errors
// too many cached {max_cached} purge the oldest
// resolved promises are cached for {ms}
// rejected promises are cached for {ms_error}

// CachedValue does the same for a single value
// using an init-time generator

const ERR = Symbol();

function clock() {
	return performance.now();
}

export class CachedValue<T> {
	static once<T>(fn: () => Promise<T>, errorMs: number = 250) {
		return new this(fn, Infinity, errorMs);
	}
	#exp: number = 0;
	#value: Promise<T> | undefined;
	constructor(
		readonly fn: () => Promise<T>,
		readonly cacheMs: number,
		readonly errorMs: number
	) {}
	clear() {
		this.#value = undefined;
	}
	set(value: T) {
		this.#value = Promise.resolve(value);
		this.#exp = clock() + this.cacheMs;
	}
	get value() {
		return this.#value;
	}
	async get() {
		if (this.#value) {
			if (this.#exp > clock()) return this.#value;
			this.#value = undefined;
		}
		let p = this.#value = this.fn();
		return p.catch(() => ERR).then(x => {
			if (this.#value === p) {
				this.#exp = clock() + (x === ERR ? this.errorMs : this.cacheMs);
			}
			return p;
		});
	}
}

export class CachedMap<K = any, V = any> {
	private readonly cached: Map<K,[exp: number, promise: Promise<V>]> = new Map();
	private readonly pending: Map<K,Promise<V>> = new Map();
	private timer: Timer | undefined;
	private timer_t: number = Infinity;
	readonly cacheMs;
	readonly errorMs;
	readonly slopMs;
	readonly maxCached;
	readonly maxPending;
	constructor({
		cacheMs = 60000, // how long to cache a resolved promise
		errorMs = 250, // how long to cache a rejected promise
		slopMs = 50, // reschedule precision
		maxCached = 10000, // overflow clears oldest items
		maxPending = 100 // overflow causes rejections
	}: { 
		cacheMs?: number;
		errorMs?: number;
		slopMs?: number;
		maxCached?: number;
		maxPending?: number;
	} = {}) {
		this.cacheMs = cacheMs;
		this.errorMs = errorMs;
		this.slopMs = slopMs;
		this.maxCached = maxCached;
		this.maxPending = maxPending;
	}
	private schedule(exp: number) {
		let now = clock();
		let t = Math.max(now + this.slopMs, exp);
		if (this.timer_t < t) return; // scheduled and shorter
		clearTimeout(this.timer); // kill old
		this.timer_t = t; // remember fire time
		if (t === Infinity) return;
		this.timer = setTimeout(() => {
			let now = clock();
			let min = Infinity;
			for (let [key, [exp]] of this.cached) {
				if (exp < now) {
					this.cached.delete(key);
				} else {
					min = Math.min(min, exp); // find next
				}
			}
			this.timer_t = Infinity;
			if (this.cached.size && min < Infinity) {
				this.schedule(min); // schedule for next
			} else {
				clearTimeout(this.timer);
			}
		}, t - now).unref(); // schedule
	}
	get pendingSize() { return this.pending.size; }
	get cachedSize() { return this.cached.size; }
	get nextExpirationMs() { return this.timer_t; }
	clear() {
		this.cached.clear();
		this.pending.clear();
		clearTimeout(this.timer);
		this.timer_t = Infinity;
	}
	// async resolvePending() {
	// 	await Promise.all(Array.from(this.pending.values()));
	// }
	set(key: K, value: V | Promise<V>, ms?: number) {
		if (!this.maxCached) return; // don't cache anything
		ms ??= this.cacheMs;
		if (ms > 0) {
			if (this.cached.size >= this.maxCached) { // we need room
				// TODO: this needs a heap
				for (let [key] of Array.from(this.cached).sort((a, b) => a[1][0] - b[1][0]).slice(-Math.ceil(this.maxCached/16))) { // remove batch
					this.cached.delete(key);
				}
			}
			let exp = clock() + ms;
			this.cached.set(key, [exp, Promise.resolve(value)]); // add cache entry
			this.schedule(exp);
		} else {
			this.cached.delete(key);
		}
	}
	delete(key: K) {
		this.cached.delete(key);
		this.pending.delete(key);
	}
	cachedRemainingMs(key: K): number {
		let c = this.cached.get(key);
		if (c) {
			let rem = c[0] - clock();
			if (rem > 0) return rem;
		}
		return 0;
	}
	cachedValue(key: K): Promise<V> | undefined {
		let c = this.cached.get(key);
		if (c) {
			let [exp, q] = c;
			if (exp > clock()) return q; // still valid
			this.cached.delete(key); // expired
		}
		return; // ree
	}
	cachedKeys(): IterableIterator<K> {
		return this.cached.keys();
	}
	peek(key: K): Promise<V> | undefined {
		return this.cachedValue(key) ?? this.pending.get(key);
	}
	get(key: K, fn: (key: K) => Promise<V>, ms?: number): Promise<V> {
		let p = this.peek(key);
		if (p) return p;
		if (this.pending.size >= this.maxPending) throw new Error('busy'); // too many in-flight
		let q = fn(key); // begin
		p = q.catch(() => ERR).then(x => { // we got an answer
			if (this.pending.delete(key)) { // remove from pending
				this.set(key, q, x && x !== ERR ? ms : this.errorMs); // add original to cache if existed
			}
			return q; // resolve to original
		});
		this.pending.set(key, p); // remember in-flight
		return p;
	}
}
