import { TaikoRollup } from '../../src/taiko/TaikoRollup.js';
import { createProviderPair } from '../providers.js';

const cfg = TaikoRollup.mainnetConfig;
const ru = await TaikoRollup.create(createProviderPair(cfg), cfg);

const commit0 = await ru.fetchCommit(await ru.fetchLatestCommitIndex());
console.log(commit0.index);
const commit1 = await ru.fetchCommit(await ru.fetchParentCommitIndex(commit0));
console.log(commit1.index);
const commit2 = await ru.fetchCommit(await ru.fetchParentCommitIndex(commit1));
console.log(commit2.index);

console.log();
const weird0 = await ru.fetchCommit(commit0.index - 5n);
console.log(weird0.index);
const weird1 = await ru.fetchCommit(await ru.fetchParentCommitIndex(weird0));
console.log(weird1.index);
