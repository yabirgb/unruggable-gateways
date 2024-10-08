import { createProvider } from '../providers.js';
import { CHAINS } from '../../src/chains.js';
import { LineaProver } from '../../src/linea/LineaProver.js';
import { EthProver } from '../../src/eth/EthProver.js';

const provider = createProvider(CHAINS.LINEA);

const prover_linea = await LineaProver.latest(provider, 100);
const prover_eth = new EthProver(provider, prover_linea.block);


//console.log(await prover_eth.fetchBlock());

const A = '0xA219439258ca9da29E9Cc4cE5596924745e12B93';
//console.log(await prover_eth.getProofs(A, [0n]));

process.on('unhandledRejection', e => {
	console.log('chonk', (e as Error).stack);
})

try {
	await prover_linea.getProofs(A, [0n]);

} catch (err) {

}
