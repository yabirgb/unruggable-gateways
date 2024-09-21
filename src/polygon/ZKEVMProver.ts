import { toBeHex } from 'ethers/utils';
import { ZeroHash } from 'ethers/constants';
import type {
  EncodedProof,
  HexAddress,
  HexString,
  HexString32,
  ProofRef,
} from '../types.js';
import { BlockProver, makeStorageKey, type TargetNeed } from '../vm.js';
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

export class ZKEVMProver extends BlockProver {
  override async isContract(target: HexAddress): Promise<boolean> {
    target = target.toLowerCase();
    if (this.fast) {
      return this.cache.get(target, async () => {
        const code = await this.provider.getCode(target, this.block);
        return code.length > 2;
      });
    }
    return isContract(await this.getProofs(target));
  }
  override async getStorage(
    target: HexAddress,
    slot: bigint,
    fast: boolean
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
    if (fast || this.fast) {
      return this.cache.get(storageKey, () =>
        this.provider.getStorage(target, slot, this.block)
      );
    }
    const proofs = await this.getProofs(target, [slot]);
    return proofs.storageProof[0].value;
  }
  protected override async _proveNeed(
    need: TargetNeed,
    accountRef: ProofRef,
    slotRefs: Map<bigint, ProofRef>
  ) {
    const m = [...slotRefs];
    const accountProof: ZKEVMAccountProof | undefined =
      await this.proofLRU.touch(need.target);
    if (accountProof && !isContract(accountProof)) m.length = 0;
    if (!m.length && !need.required) return;
    const proofs = await this.getProofs(
      need.target,
      m.map(([slot]) => slot)
    );
    if (need.required) {
      accountRef.proof = encodeProof(proofs.codeHashProof);
    }
    if (isContract(proofs)) {
      m.forEach(
        ([, ref], i) => (ref.proof = encodeProof(proofs.storageProof[i].proof))
      );
    }
  }
  async getProofs(target: HexString, slots: bigint[] = []) {
    // TODO: fix me
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
