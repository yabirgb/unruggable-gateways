import type {
  JsonRpcApiProvider,
  WebSocketProvider,
  BigNumberish,
  BytesLike,
} from 'ethers';

export type { BigNumberish, BytesLike };
export type HexString = string;
export type HexString32 = HexString;
export type HexString20 = HexString;
export type Proof = HexString[];
export type EncodedProof = HexString;

export type Provider = JsonRpcApiProvider | WebSocketProvider;
export type ProviderPair = {
  provider1: Provider;
  provider2: Provider;
};

export type RPCEthGetProof = {
  address: HexString;
  balance: HexString;
  codeHash?: HexString;
  keccakCodeHash?: HexString; // scroll reeee
  nonce: HexString;
  accountProof: Proof;
  storageHash: HexString;
  storageProof: { key: HexString; value: HexString; proof: Proof }[];
};

// without transaction detail
// https://ethereum.github.io/execution-specs/src/ethereum/cancun/blocks.py.html#ethereum.cancun.blocks.Header
// https://github.com/taikoxyz/taiko-geth/blob/30a615b4c3aafd0d395309035d58b86ff53c8eb0/core/types/block.go#L65
export type RPCEthGetBlock<TransactionT = HexString> = {
  hash: HexString;
  stateRoot: HexString;
  parentHash: HexString;
  sha3Uncles: HexString;
  miner: HexString;
  transactionsRoot: HexString;
  receiptsRoot: HexString;
  logsBloom: HexString;
  difficulty: HexString;
  number: HexString;
  gasLimit: HexString;
  gasUsed: HexString;
  extraData: HexString;
  mixHash: HexString; // prev_randao
  nonce: HexString;
  transactions: TransactionT[];
  timestamp: HexString;
  uncles: HexString[];
  // optional
  baseFeePerGas?: HexString;
  withdrawals?: HexString[];
  withdrawalsRoot?: HexString;
  blobGasUsed?: HexString;
  excessBlobGas?: HexString;
  parentBeaconBlockRoot?: HexString;
};
