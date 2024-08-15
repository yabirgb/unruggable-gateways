import { NitroRollup } from '../../src/nitro/NitroRollup.js';
import { createProviderPair } from '../providers.js';

const config = NitroRollup.arb1MainnetConfig;
const rollup = new NitroRollup(createProviderPair(config), config);

const commit0 = await rollup.fetchCommit(await rollup.fetchLatestCommitIndex());
console.log(commit0.index);
const commit1 = await rollup.fetchCommit(
  await rollup.fetchParentCommitIndex(commit0)
);
console.log(commit1.index);
const commit2 = await rollup.fetchCommit(
  await rollup.fetchParentCommitIndex(commit1)
);
console.log(commit2.index);
