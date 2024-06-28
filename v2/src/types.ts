import type {JsonRpcApiProvider, WebSocketProvider, BigNumberish, BytesLike} from 'ethers';

export type {BigNumberish, BytesLike};
export type HexString = string;
export type Proof = HexString[];

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
	storageProof: {key: HexString, value: HexString, proof: Proof}[];
};

export type RPCEthGetBlock = {
	hash: HexString;
	stateRoot: HexString;
	/*
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
	*/
}