import { ScrollRollup } from '../../src/scroll/ScrollRollup.js';
import { createProviderPair } from '../providers.js';
import { USER_CONFIG } from '../../scripts/environment.js';

const config = ScrollRollup.mainnetConfig;
const rollup = await ScrollRollup.create(
  createProviderPair(USER_CONFIG, config),
  config
);

console.log({
  CommitmentVerifier: rollup.CommitmentVerifier.target,
  apiURL: rollup.apiURL,
  defaultWindow: rollup.defaultWindow,
});

const commits = await rollup.fetchRecentCommits(10);

const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// [ 310925, 310913, 310900, 310887, 310873, 310855, 310834, 310811, 310791, 310770 ]
// [ 12, 13, 13, 14, 18, 21, 23, 20, 21 ]
