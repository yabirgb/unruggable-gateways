import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { createProviderPair } from '../providers.js';

const config = OPFaultRollup.mainnetConfig;
const rollup = await OPFaultRollup.create(createProviderPair(config), config);

console.log({
  OptimismPortal: rollup.OptimismPortal.target,
  supportedGames: rollup.supportedGames.map((g) => ({
    gameType: g.gameFinder.gameType,
    anchorRegistry: g.anchorRegistry.target,
    gameImpl: g.gameImpl.target,
  })),
  disputeGameFactory: rollup.disputeGameFactory.target,
  respectedGameType: await rollup.fetchGameType(),
  defaultWindow: rollup.defaultWindow,
});

const commits = await rollup.fetchRecentCommits(10);

const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// [ 1534, 1533, 1532, 1531, 1530, 1529, 1528, 1527, 1526, 1525 ]
// [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ]
