import {ScrollGateway} from "../../src/gateway/ScrollGateway";
import { CHAIN_SCROLL, createProviderPair } from "../../src/providers";

let g = ScrollGateway.mainnet(createProviderPair(CHAIN_SCROLL));

console.log(await g.fetchLatestCommitIndex());
console.log(await g.fetchLatestCommitIndexOnChain());
console.log(await g.getLatestCommitIndex());
