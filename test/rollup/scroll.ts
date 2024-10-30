import { ScrollRollup } from '../../src/scroll/ScrollRollup.js';
import { createProviderPair } from '../providers.js';

const config = ScrollRollup.mainnetConfig;
const rollup = new ScrollRollup(createProviderPair(config), config);

console.log({
  ScrollChain: rollup.ScrollChain.target,
  poseidon: rollup.poseidon,
  defaultWindow: rollup.defaultWindow,
});

const commits = await rollup.fetchRecentCommits(10);

const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// [ 310925, 310913, 310900, 310887, 310873, 310855, 310834, 310811, 310791, 310770 ]
// [ 12, 13, 13, 14, 18, 21, 23, 20, 21 ]

// [ 344807, 344795, 344783, 344772, 344764, 344755, 344748, 344741, 344731, 344724 ]
// [ 12, 12, 11, 8, 9, 7, 7, 10, 7 ]
