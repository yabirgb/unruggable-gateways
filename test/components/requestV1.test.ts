import { GatewayRequest } from '../../src/vm.js';
import { GatewayRequestV1 } from '../../src/v1.js';
import { test, expect } from 'bun:test';

const A = '0x1234567890AbcdEF1234567890aBcdef12345678';

test('getDynamic(8)', () => {
  const r1 = new GatewayRequestV1(A).getDynamic(8);
  const r2 = new GatewayRequest().setTarget(A).setSlot(8).readBytes().addOutput();
  expect(r1.v2()).toStrictEqual(r2);
});

test('getDynamic(1).element(2)', () => {
  const r1 = new GatewayRequestV1(A).getDynamic(1).element(2);
  const r2 = new GatewayRequest()
    .setTarget(A)
    .setSlot(1)
    .push(2)
    .follow()
    .readBytes()
    .addOutput();
  expect(r1.v2()).toStrictEqual(r2);
});

test('getStatic(3).getStatic(4).ref(0)', () => {
  const r1 = new GatewayRequestV1(A).getStatic(3).getStatic(4).ref(0);
  const r2 = new GatewayRequest()
    .setTarget(A)
    .setSlot(3)
    .read()
    .addOutput()
    .setSlot(4)
    .pushOutput(0)
    .follow()
    .read()
    .addOutput();
  expect(r1.v2()).toStrictEqual(r2);
});

test('getDynamic(3).element(4).element(5).getStatic(6).element(bytes("raffy"))', () => {
  const r1 = new GatewayRequestV1(A)
    .getDynamic(3)
    .element(4)
    .element(5)
    .getStatic(6)
    .elementStr('raffy');
  const r2 = new GatewayRequest()
    .setTarget(A)
    .setSlot(3)
    .push(4)
    .follow()
    .push(5)
    .follow()
    .readBytes()
    .addOutput()
    .setSlot(6)
    .pushStr('raffy')
    .follow()
    .read()
    .addOutput();
  expect(r1.v2()).toStrictEqual(r2);
});
