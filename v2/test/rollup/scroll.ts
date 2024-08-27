import { ScrollRollup } from '../../src/scroll/ScrollRollup.js';
import { createProviderPair } from '../providers.js';

const config = ScrollRollup.mainnetConfig;
const rollup = await ScrollRollup.create(createProviderPair(config), config);

console.log({
  CommitmentVerifier: rollup.CommitmentVerifier.target,
  apiURL: rollup.apiURL,
  commitStep: rollup.commitStep,
  defaultWindow: rollup.defaultWindow,
});

const commits = await rollup.fetchRecentCommits(10);

const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// [ 309195, 309180, 309165, 309150, 309135, 309120, 309105, 309090, 309075, 309060 ]
// [ 15, 15, 15, 15, 15, 15, 15, 15, 15 ]

const unaligned = await rollup.fetchCommit(commits[0].index - 1n);
console.log(await rollup.fetchAPILatestCommitIndex());
console.log(commits[0].index);
console.log(unaligned.index);
console.log(await rollup.fetchParentCommitIndex(unaligned));

// 309195n
// 309194n
// 309180n
