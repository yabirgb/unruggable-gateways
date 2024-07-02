import {OPFaultGateway} from "../../src/gateway/OPFaultGateway";
import {CHAIN_OP, createProviderPair} from "../../src/providers";

let g = OPFaultGateway.mainnet(createProviderPair(CHAIN_OP));

console.log('fetchLatestCommitIndex', await g.fetchLatestCommitIndex());
console.log('  getLatestCommitIndex', await g.getLatestCommitIndex()); // -offset
console.log('        findLatestGame', await g.findLatestGame()); // -offset + valid check
