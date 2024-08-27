import type { HexAddress, HexString, HexString32 } from '../types.js';

export type EthProof = HexString[];

export type EthStorageProof = {
  key: HexString;
  value: HexString;
  proof: EthProof;
};

export type RPCEthGetProof = {
  address: HexAddress;
  balance: HexString;
  codeHash?: HexString32;
  keccakCodeHash?: HexString32; // scroll reeee
  nonce: HexString;
  accountProof: EthProof;
  storageHash: HexString32;
  storageProof: EthStorageProof[];
};

export type EthAccountProof = Omit<RPCEthGetProof, 'storageProof'>;

// without transaction detail
// https://ethereum.github.io/execution-specs/src/ethereum/cancun/blocks.py.html#ethereum.cancun.blocks.Header
// https://github.com/taikoxyz/taiko-geth/blob/30a615b4c3aafd0d395309035d58b86ff53c8eb0/core/types/block.go#L65
export type RPCEthGetBlock<TransactionT = HexString> = {
  hash: HexString32;
  stateRoot: HexString32;
  parentHash: HexString32;
  sha3Uncles: HexString32;
  miner: HexAddress;
  transactionsRoot: HexString32;
  receiptsRoot: HexString32;
  logsBloom: HexString;
  difficulty: HexString;
  number: HexString;
  gasLimit: HexString;
  gasUsed: HexString;
  extraData: HexString;
  mixHash: HexString32; // prev_randao
  nonce: HexString;
  transactions: TransactionT[];
  timestamp: HexString;
  uncles: HexString[];
  // optional
  baseFeePerGas?: HexString;
  withdrawals?: HexString[];
  withdrawalsRoot?: HexString32;
  blobGasUsed?: HexString;
  excessBlobGas?: HexString;
  parentBeaconBlockRoot?: HexString32;
};
