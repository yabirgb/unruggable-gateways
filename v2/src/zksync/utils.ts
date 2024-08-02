import type { HexString, Provider } from '../types.js';
import type { RPCZKSyncGetProof } from './types.js';
import { toBeHex } from 'ethers';

export async function fetchStorageProofs(
  provider: Provider,
  batchNumber: number,
  target: HexString,
  slots: bigint[],
  proofBatchSize = 64
) {
  const ps: Promise<RPCZKSyncGetProof>[] = [];
  for (let i = 0; i < slots.length; ) {
    ps.push(
      provider.send('zks_getProof', [
        target,
        slots.slice(i, (i += proofBatchSize)).map((slot) => toBeHex(slot, 32)),
        batchNumber,
      ])
    );
  }
  const vs = await Promise.all(ps);
  return vs.flatMap((x) => x.storageProof);
}
