import {ScrollGateway} from "../../src/gateway/ScrollGateway";
import { CHAIN_SCROLL, createProviderPair } from "../../src/providers";

let g = ScrollGateway.mainnet(createProviderPair(CHAIN_SCROLL));

console.log('       fetchLatestCommitIndex', await g.fetchLatestCommitIndex());
console.log('fetchLatestCommitIndexOnChain', await g.fetchLatestCommitIndexOnChain());
console.log('         getLatestCommitIndex', await g.getLatestCommitIndex());
