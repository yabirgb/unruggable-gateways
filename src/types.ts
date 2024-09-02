import type { JsonRpcApiProvider, BigNumberish, BytesLike } from 'ethers';

export type { BigNumberish, BytesLike };
export type HexString = string;
export type HexString32 = HexString;
export type HexAddress = HexString;
export type EncodedProof = HexString;

export type Provider = JsonRpcApiProvider;
export type ProviderPair = {
  provider1: Provider;
  provider2: Provider;
};

export type Chain = bigint;
export type ChainPair = {
  chain1: Chain;
  chain2: Chain;
};
