import type { EncodedProof, HexString, Provider } from '../types.js';
import type {
  EthAccountProof,
  EthProof,
  EthStorageProof,
  RPCEthGetProof,
} from './types.js';
import {
  AbstractProver,
  isTargetNeed,
  makeStorageKey,
  type Need,
} from '../vm.js';
import { ZeroHash } from 'ethers/constants';
import { toBeHex } from 'ethers/utils';
import {
  ABI_CODER,
  fetchBlock,
  NULL_CODE_HASH,
  sendRetry,
  toString16,
  withResolvers,
} from '../utils.js';
import { unwrap } from '../wrap.js';

function isContract(proof: EthAccountProof) {
  return (
    proof.codeHash !== NULL_CODE_HASH && proof.keccakCodeHash !== NULL_CODE_HASH
  );
}

export function encodeProof(proof: EthProof): EncodedProof {
  return ABI_CODER.encode(['bytes[]'], [proof]);
}

export function reduceNeeds(needs: Need[]) {
  // reduce an ordered list of needs into a deduplicated list of proofs
  // provide empty proofs for non-contract slots
  type Ref = { id: number; proof: EncodedProof };
  type Bucket = { ref: Ref; map: Map<bigint, Ref> };
  const promises: Promise<any>[] = [];
  const named = new Map<HexString, Ref>();
  const buckets = new Map<HexString, Bucket>();
  const refs: Ref[] = [];
  let nullRef: Ref | undefined;
  const createRef = () => {
    const ref = { id: refs.length, proof: '0x' };
    refs.push(ref);
    return ref;
  };
  let bucket: Bucket | undefined;
  const order = needs.map((need) => {
    if (isTargetNeed(need)) {
      // accountProof
      // we must prove this value since it leads to a stateRoot
      bucket = buckets.get(need.target);
      if (!bucket) {
        bucket = { ref: createRef(), map: new Map() };
        buckets.set(need.target, bucket);
      }
      return bucket.ref;
    } else if (typeof need === 'bigint') {
      // storageProof (for targeted account)
      // bucket can be undefined if a slot is read without a target
      // this is okay because the initial machine state is NOT_A_CONTRACT
      if (!bucket) return (nullRef ??= createRef());
      let ref = bucket.map.get(need);
      if (!ref) {
        ref = createRef();
        bucket.map.set(need, ref);
      }
      return ref;
    } else {
      let ref = named.get(need.hash);
      if (!ref) {
        ref = createRef();
        promises.push((async () => (ref.proof = await unwrap(need.value)))());
        named.set(need.hash, ref);
      }
      return ref;
    }
  });
  return { promises, named, buckets, refs, order };
}

export class EthProver extends AbstractProver {
  static async latest(provider: Provider) {
    return new this(provider, toString16(await provider.getBlockNumber()));
  }
  proofRetryCount = 0;
  constructor(
    readonly provider: Provider,
    readonly block: HexString
  ) {
    super();
  }
  async fetchStateRoot() {
    // this is just a convenience
    const blockInfo = await fetchBlock(this.provider, this.block);
    return blockInfo.stateRoot;
  }
  async fetchProofs(
    target: HexString,
    slots: bigint[] = []
  ): Promise<RPCEthGetProof> {
    const ps = [];
    for (let i = 0; ; ) {
      ps.push(
        sendRetry<RPCEthGetProof>(
          this.provider,
          'eth_getProof',
          [
            target,
            slots
              .slice(i, (i += this.proofBatchSize))
              .map((slot) => toBeHex(slot, 32)),
            this.block,
          ],
          this.proofRetryCount
        )
      );
      if (i >= slots.length) break;
    }
    const vs = await Promise.all(ps);
    for (let i = 1; i < vs.length; i++) {
      vs[0].storageProof.push(...vs[i].storageProof);
    }
    return vs[0];
  }
  async getProofs(
    target: HexString,
    slots: bigint[] = []
  ): Promise<RPCEthGetProof> {
    target = target.toLowerCase();
    const missing: number[] = []; // indices of slots we dont have proofs for
    const { promise, resolve, reject } = withResolvers(); // create a blocker
    // 20240708: must setup blocks before await
    let accountProof: Promise<EthAccountProof> | EthAccountProof | undefined =
      this.proofLRU.touch(target);
    if (!accountProof) {
      // missing account proof, so block it
      this.proofLRU.setPending(
        target,
        promise.then(() => accountProof)
      );
    }
    // check if we're missing any slots
    const storageProofs: (
      | Promise<EthStorageProof>
      | EthStorageProof
      | undefined
    )[] = slots.map((slot, i) => {
      const key = makeStorageKey(target, slot);
      const p = this.proofLRU.touch(key);
      if (!p) {
        // missing storage proof, so block it
        this.proofLRU.setPending(
          key,
          promise.then(() => storageProofs[i])
        );
        missing.push(i);
      }
      return p;
    });
    // check if we need something
    if (!accountProof || missing.length) {
      try {
        const { storageProof: v, ...a } = await this.fetchProofs(
          target,
          missing.map((x) => slots[x])
        );
        // update cache
        accountProof = a;
        missing.forEach((x, i) => (storageProofs[x] = v[i]));
        resolve(); // unblock
      } catch (err) {
        reject(err);
        throw err;
      }
    }
    // reassemble
    const [a, v] = await Promise.all([
      accountProof,
      Promise.all(storageProofs),
    ]);
    return { storageProof: v as EthStorageProof[], ...a };
  }
  override async getStorage(
    target: HexString,
    slot: bigint
  ): Promise<HexString> {
    target = target.toLowerCase();
    // check to see if we know this target isn't a contract without invoking provider
    // this is almost equivalent to: await isContract(target)
    const accountProof: EthAccountProof | undefined =
      await this.proofLRU.touch(target);
    if (accountProof && !isContract(accountProof)) {
      return ZeroHash;
    }
    // check to see if we've already have a proof for this value
    const storageKey = makeStorageKey(target, slot);
    const storageProof: EthStorageProof | undefined =
      await this.proofLRU.touch(storageKey);
    if (storageProof) {
      return toBeHex(storageProof.value, 32);
    }
    if (this.fastCache) {
      return this.fastCache.get(storageKey, () =>
        this.provider.getStorage(target, slot, this.block)
      );
    }
    const proofs = await this.getProofs(target, [slot]);
    return proofs.storageProof[0].value;
  }
  override async isContract(target: HexString) {
    target = target.toLowerCase();
    if (this.fastCache) {
      return this.fastCache.get(target, async () => {
        const code = await this.provider.getCode(target, this.block);
        return code.length > 2;
      });
    } else {
      return isContract(await this.getProofs(target, []));
    }
  }
  override async prove(needs: Need[]) {
    return this.standardReduce(needs, async (target, accountRef, slotRefs) => {
      const m = [...slotRefs];
      const accountProof: EthAccountProof | undefined =
        await this.proofLRU.peek(target);
      if (accountProof && !isContract(accountProof)) m.length = 0;
      const proofs = await this.getProofs(
        target,
        m.map(([slot]) => slot)
      );
      accountRef.proof = encodeProof(proofs.accountProof);
      if (isContract(proofs)) {
        m.forEach(
          ([, ref], i) =>
            (ref.proof = encodeProof(proofs.storageProof[i].proof))
        );
      }
    });
  }
}
