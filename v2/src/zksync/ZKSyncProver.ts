import type { RPCZKSyncGetProof, ZKSyncStorageProof } from './types.js';
import type {
  Provider,
  HexAddress,
  HexString,
  EncodedProof,
} from '../types.js';
import {
  AbstractProver,
  makeStorageKey,
  type Need,
  type ProofSequence,
} from '../vm.js';
import { toBeHex } from 'ethers';
import { ABI_CODER } from '../utils.js';

// https://docs.zksync.io/build/api-reference/zks-rpc#zks_getproof
// https://github.com/matter-labs/era-contracts/blob/fd4aebcfe8833b26e096e87e142a5e7e4744f3fa/system-contracts/bootloader/bootloader.yul#L458
export const ZKSYNC_ACCOUNT_CODEHASH =
  '0x0000000000000000000000000000000000008002';

function encodeStorageProof(proof: ZKSyncStorageProof) {
  return ABI_CODER.encode(
    ['bytes32', 'uint64', 'bytes32[]'],
    [proof.value, proof.index, proof.proof]
  );
}

export class ZKSyncProver extends AbstractProver {
  static async latest(provider: Provider) {
    return new this(
      provider,
      Number(await provider.send('zks_L1BatchNumber', []))
    );
  }
  constructor(
    readonly provider: Provider,
    readonly batchIndex: number
  ) {
    super();
  }
  override async isContract(target: HexAddress): Promise<boolean> {
    const storageProof: ZKSyncStorageProof | undefined =
      await this.proofLRU.touch(target.toLowerCase());
    const codeHash = storageProof
      ? storageProof.value
      : await this.getStorage(ZKSYNC_ACCOUNT_CODEHASH, BigInt(target));
    return !/^0x0+$/.test(codeHash);
  }
  override async getStorage(
    target: HexAddress,
    slot: bigint
  ): Promise<HexString> {
    target = target.toLowerCase();
    const storageKey = makeStorageKey(target, slot);
    const storageProof: ZKSyncStorageProof | undefined =
      await this.proofLRU.touch(storageKey);
    if (storageProof) {
      return storageProof.value;
    }
    if (this.fastCache) {
      return this.fastCache.get(storageKey, () =>
        this.provider.getStorage(target, slot)
      );
    }
    const vs = await this.getStorageProofs(target, [slot]);
    return vs[0].value;
  }
  override async prove(needs: Need[]): Promise<ProofSequence> {
    type Ref = { id: number; proof: EncodedProof };
    const targets = new Map<HexString, Map<bigint, Ref>>();
    const refs: Ref[] = [];
    let nullRef: Ref | undefined;
    const createRef = () => {
      const ref = { id: refs.length, proof: '0x' };
      refs.push(ref);
      return ref;
    };
    const order = needs.map(([target, slot]) => {
      if (slot === false) {
        // accountProof that isn't used
        // save 12m gas by not including a proof
        if (!nullRef) nullRef = createRef();
        return nullRef.id;
      }
      if (slot === true) {
        slot = BigInt(target);
        target = ZKSYNC_ACCOUNT_CODEHASH;
      }
      let bucket = targets.get(target);
      if (!bucket) {
        bucket = new Map();
        targets.set(target, bucket);
      }
      let ref = bucket.get(slot);
      if (!ref) {
        ref = createRef();
        bucket.set(slot, ref);
      }
      return ref.id;
    });
    await Promise.all(
      Array.from(targets, async ([target, map]) => {
        const m = [...map];
        const proofs = await this.getStorageProofs(
          target,
          m.map(([slot]) => slot)
        );
        m.forEach(([, ref], i) => (ref.proof = encodeStorageProof(proofs[i])));
      })
    );
    return {
      proofs: refs.map((x) => x.proof),
      order: Uint8Array.from(order),
    };
  }
  async getStorageProofs(target: HexString, slots: bigint[]) {
    target = target.toLowerCase();
    const missing: number[] = [];
    const { promise, resolve, reject } = Promise.withResolvers();
    const storageProofs: (
      | Promise<ZKSyncStorageProof>
      | ZKSyncStorageProof
      | undefined
    )[] = slots.map((slot, i) => {
      const key = makeStorageKey(target, slot);
      const p = this.proofLRU.touch(key);
      if (!p) {
        this.proofLRU.setPending(
          key,
          promise.then(() => storageProofs[i])
        );
        missing.push(i);
      }
      return p;
    });
    if (missing.length) {
      try {
        const vs = await this.fetchStorageProofs(
          target,
          missing.map((x) => slots[x])
        );
        missing.forEach((x, i) => (storageProofs[x] = vs[i]));
        resolve();
      } catch (err) {
        reject(err);
        throw err;
      }
    }
    return Promise.all(storageProofs) as Promise<ZKSyncStorageProof[]>;
  }
  async fetchStorageProofs(
    target: HexString,
    slots: bigint[]
  ): Promise<ZKSyncStorageProof[]> {
    const ps: Promise<RPCZKSyncGetProof>[] = [];
    for (let i = 0; i < slots.length; ) {
      ps.push(
        this.provider.send('zks_getProof', [
          target,
          slots
            .slice(i, (i += this.proofBatchSize))
            .map((slot) => toBeHex(slot, 32)),
          this.batchIndex,
        ])
      );
    }
    const vs = await Promise.all(ps);
    return vs.flatMap((x) => x.storageProof);
  }
}
