import {EVMRequest} from '../../src/vm.js';
import {EVMRequestV1} from '../../src/v1.js';
import assert from 'node:assert/strict';
import {test} from 'bun:test';

const A = '0x1234567890AbcdEF1234567890aBcdef12345678';

test('getDynamic(8)', () => {
	let r1 = new EVMRequestV1(A).getDynamic(8);
	let r2 = new EVMRequest().setTarget(A).setSlot(8).readBytes().addOutput();
	assert.deepEqual(r1.v2(), r2);
});

test('getDynamic(1).element(2)', () => {
	let r1 = new EVMRequestV1(A).getDynamic(1).element(2);
	let r2 = new EVMRequest().setTarget(A).setSlot(1).push(2).follow().readBytes().addOutput();
	assert.deepEqual(r1.v2(), r2);
});

test('getStatic(3).getStatic(4).ref(0)', () => {
	let r1 = new EVMRequestV1(A)
		.getStatic(3)
		.getStatic(4).ref(0);
	let r2 = new EVMRequest().setTarget(A)
		.setSlot(3).read().addOutput()
		.setSlot(4).pushOutput(0).follow().read().addOutput();
	assert.deepEqual(r1.v2(), r2);
});

test('getDynamic(3).element(4).element(5).getStatic(6).element(bytes("raffy"))', () => {
	let r1 = new EVMRequestV1(A)
		.getDynamic(3).element(4).element(5)
		.getStatic(6).elementStr("raffy");
	let r2 = new EVMRequest().setTarget(A)
		.setSlot(3).push(4).follow().push(5).follow().readBytes().addOutput()
		.setSlot(6).pushStr("raffy").follow().read().addOutput();
	assert.deepEqual(r1.v2(), r2);
});

