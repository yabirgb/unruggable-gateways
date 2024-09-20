import { afterAll, describe as describe0 } from 'bun:test';

// bun:test is shit
// using a beforeAll() is disgusting for test setup
// this technique replaces afterAll() and ensures proper shutdown

type DeferredFn = () => any;
type RegisterFn = (fn: DeferredFn) => any;
type OriginalFn = (defer: RegisterFn) => void;

export function describe(label: string, fn0: OriginalFn) {
  describe0(label, async () => {
    const v: DeferredFn[] = [];
    try {
      await fn0((fn) => {
        v.push(fn);
        afterAll(fn);
      });
    } catch (cause) {
      while (v.length) {
        try {
          await v.pop()!();
        } catch (ignored) {
          //
        }
      }
      throw new Error(`describe() "${label}" failed`, { cause });
    }
  });
}

// sigh...
describe.skipIf =
  (skip: boolean) =>
  (...a: Parameters<typeof describe>) =>
    skip ? describe0.skip(a[0], () => {}) : describe(...a);
