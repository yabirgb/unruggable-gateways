import { createProviderPair } from '../providers.js';
import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';

for (const minAgeSec of [0, 86400, 3600, 1]) {
	const config = {...OPFaultRollup.baseSepoliaConfig, minAgeSec};
	const rollup = new OPFaultRollup(createProviderPair(config), config);
	const index = await rollup.fetchLatestCommitIndex();
	console.log(minAgeSec, index);
}
