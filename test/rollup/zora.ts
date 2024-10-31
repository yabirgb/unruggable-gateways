import { OPRollup } from '../../src/op/OPRollup.js';
import { createProviderPair } from '../providers.js';

const config = OPRollup.zoraMainnetConfig;
const rollup = new OPRollup(createProviderPair(config), config);

console.log({
  L2OutputOracle: rollup.L2OutputOracle.target,
  defaultWindow: rollup.defaultWindow,
});

const commits = await rollup.fetchRecentCommits(10);

const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// [ 12367, 12366, 12365, 12364, 12363, 12362, 12361, 12360, 12359, 12358 ]
// [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ]
