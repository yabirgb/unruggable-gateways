import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { createProviderPair } from '../providers.js';

for (const minAgeSec of [0, 86400, 3600, 1]) {
	const config = {...OPFaultRollup.baseTestnetConfig, minAgeSec};
	const rollup = new OPFaultRollup(createProviderPair(config), config);
	const index = await rollup.fetchLatestCommitIndex();
	console.log(minAgeSec, index);
}
