import { LineaCommitFinder } from '../../src/linea/LineaCommitFinder.js';
import { createProviderPair } from '../providers.js';
import { LineaGateway } from '../../src/linea/LineaGateway.js';

const config = LineaGateway.mainnetConfig;
const gateway = new LineaGateway({
  ...createProviderPair(config),
  ...config,
});

const finder = new LineaCommitFinder(gateway.L1MessageService, 5);

console.log(await finder.recentL2Blocks());
console.log(await finder.recentL2Blocks());
