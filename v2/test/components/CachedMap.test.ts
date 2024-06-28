import {test, describe, expect} from 'bun:test';
import {CachedMap} from '../../src/cached.js';

function wait(t: number) {
	return new Promise(f => setTimeout(f, t));
}

describe('CachedMap', () => {

	// cached map with 0 cache time should clear immediately after resolves
	test('pending map', async () => {
		let c = new CachedMap({cacheMs: 0});
		await c.get('A', async () => 1);
		expect(c.cachedSize).toEqual(0);
		expect(c.get('A', async () => { throw 2 })).rejects.toBe(2);
		expect(c.peek('A')).rejects.toBe(2);
	});

	// cached map with infinite cache time should resolve once and never schedule
	test('once map', async () => {
		let c = new CachedMap({cacheMs: Infinity});
		await c.get('A', async () => 1);
		expect(c.cachedRemainingMs('A') === Infinity);
		expect(c.nextExpirationMs).toEqual(Infinity);
		expect(c.get('A', async () => { throw 'wtf'; })).resolves.toBe(1);
	});

	test('cached map', async () => {
		let c = new CachedMap({cacheMs: 1000});
		c.get('A', () => wait(1000).then(() => 1));
		c.get('B', () => wait(1500).then(() => 2), 2000);
		expect(c.get('A', async () => { throw 'wtf'; })).resolves.toBe(1);
		expect(c.pendingSize).toBe(1);
		expect(c.cachedSize).toBe(1);
		expect(c.cachedRemainingMs('A')).toBeGreaterThan(900);
		expect(c.peek('B')).resolves.toBe(2);
		expect(c.cachedSize).toBe(2);
		expect(c.cachedValue('A')).resolves.toBe(1);
		expect(c.cachedRemainingMs('B')).toBeGreaterThan(1900);
		await wait(1100);
		expect(c.cachedSize).toBe(1);
		expect(c.cachedValue('B')).resolves.toBe(2);
		await wait(1100);
		expect(c.cachedSize).toBe(0);
	});

});
