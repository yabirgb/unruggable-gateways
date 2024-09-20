import { toBeHex } from 'ethers/utils';
import { ZeroHash } from 'ethers/constants';
import {
  EncodedProof,
  HexAddress,
  HexString,
  HexString32,
  Provider,
} from '../types.js';
import { AbstractProver, makeStorageKey, Need, ProofSequence } from '../vm.js';
import { ABI_CODER } from '../utils.js';

export type ZKEVMProof = HexString[];

export type RPCZKEVMGetProof = {
  address: HexAddress;
  balance: HexString;
  codeHash: HexString32;
  codeLength: HexString;
  nonce: HexString;
  balanceProof: ZKEVMProof;
  nonceProof: ZKEVMProof;
  codeHashProof: ZKEVMProof;
  codeLengthProof: ZKEVMProof;
  storageProof: ZKEVMStorageProof[];
};

export type ZKEVMAccountProof = Omit<RPCZKEVMGetProof, 'storageProof'>;

export type ZKEVMStorageProof = {
  key: HexString32;
  value: HexString;
  proof: ZKEVMProof;
};

function isContract(proof: ZKEVMAccountProof) {
  return parseInt(proof.codeLength) > 0;
}

function encodeProof(proof: ZKEVMProof): EncodedProof {
  return ABI_CODER.encode(['bytes[]'], [proof]);
}

export class ZKEVMProver extends AbstractProver {
  constructor(
    readonly provider: Provider,
    readonly block: HexString
  ) {
    super();
  }
  override async isContract(target: HexString): Promise<boolean> {
    target = target.toLowerCase();
    if (this.fastCache) {
      return this.fastCache.get(target, async () => {
        const code = await this.provider.getCode(target, this.block);
        return code.length > 2;
      });
    }
    return isContract(await this.getProofs(target));
  }
  override async getStorage(
    target: HexString,
    slot: bigint
  ): Promise<HexString> {
    target = target.toLowerCase();
    // check to see if we know this target isn't a contract without invoking provider
    // this is almost equivalent to: await isContract(target)
    const accountProof: ZKEVMAccountProof | undefined =
      await this.proofLRU.touch(target);
    if (accountProof && !isContract(accountProof)) {
      return ZeroHash;
    }
    // check to see if we've already have a proof for this value
    const storageKey = makeStorageKey(target, slot);
    const storageProof: ZKEVMStorageProof | undefined =
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
  override async prove(needs: Need[]): Promise<ProofSequence> {
    type Ref = { id: number; proof: EncodedProof };
    type RefMap = Ref & { map: Map<bigint, Ref>; required: boolean };
    const targets = new Map<HexString, RefMap>();
    const refs: Ref[] = [];
    const order = needs.map(([target, slot]) => {
      let bucket = targets.get(target);
      if (typeof slot === 'boolean') {
        if (bucket) {
          bucket.required ||= slot;
        } else {
          bucket = {
            id: refs.length,
            proof: '0x',
            map: new Map(),
            required: slot,
          };
          refs.push(bucket);
          targets.set(target, bucket);
        }
        return bucket.id;
      } else {
        let ref = bucket?.map.get(slot);
        if (!ref) {
          ref = { id: refs.length, proof: '0x' };
          refs.push(ref);
          bucket?.map.set(slot, ref);
        }
        return ref.id;
      }
    });
    if (refs.length > this.maxUniqueProofs) {
      throw new Error(
        `too many proofs: ${refs.length} > ${this.maxUniqueProofs}`
      );
    }
    await Promise.all(
      Array.from(targets, async ([target, bucket]) => {
        let m = [...bucket.map];
        try {
          const accountProof: ZKEVMAccountProof | undefined =
            await this.proofLRU.touch(target);
          if (accountProof && !isContract(accountProof)) {
            m = []; // if we know target isn't a contract, we only need accountProof
          }
        } catch (err) {
          /*empty*/
        }
        if (!bucket.required && !m.length) return;
        const proofs = await this.getProofs(
          target,
          m.map(([slot]) => slot)
        );
        if (bucket.required) {
          bucket.proof = encodeProof(proofs.codeHashProof);
        }
        if (isContract(proofs)) {
          m.forEach(
            ([, ref], i) =>
              (ref.proof = encodeProof(proofs.storageProof[i].proof))
          );
        }
      })
    );
    return {
      proofs: refs.map((x) => x.proof),
      order: Uint8Array.from(order),
    };
  }
  async getProofs(target: HexString, slots: bigint[] = []) {
    return this.fetchProofs(target, slots);
  }
  async fetchProofs(target: HexString, slots: bigint[] = []) {
    const ps: Promise<RPCZKEVMGetProof>[] = [];
    for (let i = 0; ; ) {
      ps.push(
        this.provider.send('zkevm_getProof', [
          target,
          slots
            .slice(i, (i += this.proofBatchSize))
            .map((slot) => toBeHex(slot, 32)),
          this.block,
        ])
      );
      if (i >= slots.length) break;
    }
    const vs = await Promise.all(ps);
    for (let i = 1; i < vs.length; i++) {
      vs[0].storageProof.push(...vs[i].storageProof);
    }
    return vs[0];
  }
}
