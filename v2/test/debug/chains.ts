import { CHAINS } from '../../src/chains.js';
import { CHAIN_MAP, providerURL } from '../providers.js';

const usingPublic: string[] = [];
const leftoverChains = new Set(Object.values(CHAINS));

for (const info of CHAIN_MAP.values()) {
	leftoverChains.delete(info.chain);
	const url = providerURL(info.chain);
  	console.log({...info, url});
	if (url === info.rpc) {
		usingPublic.push(url);
	}
}

if (usingPublic.length) {
	console.log(`\x1B[31mWARNING!\x1B[0m ${usingPublic.length} using public!`);
	console.log(usingPublic);
}

if (leftoverChains.size) {
	console.log(leftoverChains);
	throw new Error('missing ChainInfo');
}
