
import { createProvider } from '../providers.js';
import { ethers } from 'ethers';
import { EVMRequest, ZKSyncProver } from '../../src/vm.js';
import { ZKSyncGateway } from '../../src/zksync/gateway.js';
import { CHAIN_MAINNET, CHAIN_ZKSYNC } from '../../src/chains.js';

const provider1 = createProvider(CHAIN_MAINNET);
const provider2 = createProvider(CHAIN_ZKSYNC);

if (true) {
  const gateway = new ZKSyncGateway({
    provider1,
    provider2,
    ...ZKSyncGateway.mainnetConfig(),
  });

  console.log(await gateway.f());
  console.log(await gateway.DiamondProxy.getTotalBatchesCommitted());
  console.log(await gateway.DiamondProxy.getTotalBatchesVerified());
  console.log(await gateway.DiamondProxy.getTotalBatchesExecuted());

  console.log(await gateway.getLatestCommit());


  throw 1;
}

if (true) {
  const proxy = new ethers.Contract(
    '0x32400084C286CF3E17e7B677ea9583e60a000324',
    [
      'function getTotalBatchesCommitted() view returns (uint256)',
      'function getTotalBatchesVerified() view returns (uint256)',
      'function getTotalBatchesExecuted() view returns (uint256)',
    ],
    provider1
  );

  const batchIndex = parseInt(await provider2.send('zks_L1BatchNumber', []));
  console.log(batchIndex);
  console.log(await proxy.getTotalBatchesCommitted());
  console.log(await proxy.getTotalBatchesVerified());
  console.log(await proxy.getTotalBatchesExecuted());

 // const b = Number(await proxy.getTotalBatchesVerified());
//   const b = Number(await proxy.getTotalBatchesExecuted());
//   const a = b - 10;

//   for (let i = a; i <= b; i++) {
// 	const b = await provider2.send('zks_getL1BatchDetails', [i]);;
// 	console.log(i, b.status);
//   }


//   console.log(
//     await provider2.send('zks_getL1BatchDetails', [batchIndex - 100])
//   );
}

if (false) {
  console.log(await proxy.getTotalBatchesCommitted());
  console.log(await proxy.getTotalBatchesVerified());
  console.log(await proxy.getTotalBatchesExecuted());
  // 490012n
  // 490008n -4
  // 489961n -47

  const prover = await ZKSyncProver.latest(provider2);

  console.log(
    await prover.isContract('0x51050ec063d393217B436747617aD1C2285Aeeee')
  );
  console.log(
    await prover.isContract('0x5A7d6b2F92C77FAD6CCaBd7EE0624E64907Eaf3E')
  );

  const req = new EVMRequest();
  req.setTarget('0x5A7d6b2F92C77FAD6CCaBd7EE0624E64907Eaf3E');
  for (let i = 0; i < 5; i++) {
    req.setSlot(i).read().addOutput();
  }
  const vm = await prover.evalRequest(req);
  console.log(await vm.resolveOutputs());
}

/*

//const block = await p.getBlockNumber();
//console.log(block);

// 0x0000000000000000000000000000000000008002 account code hash
// 0x0000000000000000000000000000000000008003 account nonce

//console.log(await p.send('zks_L1BatchNumber', []));
//const batchIndex = parseInt(await p.send('zks_L1BatchNumber', []));
const batchIndex = parseInt(await p.send('zks_L1BatchNumber', []));
console.log(batchIndex);

const proof = await p.send('zks_getProof', [
  '0x0000000000000000000000000000000000008002',
  [
    ethers.toBeHex('0x51050ec063d393217B436747617aD1C2285Aeeee', 32),
    ethers.toBeHex('0x5A7d6b2F92C77FAD6CCaBd7EE0624E64907Eaf3E', 32),
  ],
  batchIndex,
]);

console.log(proof);


const batch = await p.send('zks_getL1BatchDetails', [batchIndex]);
console.log(batch);
// {
//   baseSystemContractsHashes: {
//     bootloader: "0x010008e742608b21bf7eb23c1a9d0602047e3618b464c9b59c0fba3b3d7ab66e",
//     default_aa: "0x01000563374c277a2c1e34659a2a1e87371bb6d852ce142022d497bfb50b9e32",
//   },
//   commitTxHash: null,
//   committedAt: null,
//   executeTxHash: null,
//   executedAt: null,
//   fairPubdataPrice: 3646644931,
//   l1GasPrice: 2279153081,
//   l1TxCount: 0,
//   l2FairGasPrice: 45250000,
//   l2TxCount: 3426,
//   number: 489835,
//   proveTxHash: null,
//   provenAt: null,
//   rootHash: "0x1d260cdaa27e4d0d2b590e55682ed219368ec39803d833b4bf963917f3afa2e4",
//   status: "sealed",
//   timestamp: 1722199697,
// }

const proof = await p.send('zks_getProof', [
'0x5A7d6b2F92C77FAD6CCaBd7EE0624E64907Eaf3E',
[ethers.toBeHex(0, 32), ethers.toBeHex(1, 32)],
batchIndex,
]);
console.log(proof);
// {
// 	address: "0x5a7d6b2f92c77fad6ccabd7ee0624e64907eaf3e",
// 	storageProof: [
// 	  {
// 		index: 322727228,
// 		key: "0x0000000000000000000000000000000000000000000000000000000000000000",
// 		proof: [
// 		  "0xb620a1cb585777d9ba6cf70a62d81cd427cd0d0500218dbd7dd3581ce370aedb", "0x2ff327c5444ceac9512a0836c3c974892715457a3a035af44d466c76c5ac6f3c",
// 		  "0x6c0f0c3caffc4d5a946007085331cfb4abe4452a9a1f87d53d52169ac5818144", "0x3431ae1b80b9939ab51031643e58e767dfc322fc01b09c4a27516a545786673c",
// 		  "0x5ea6397dc6d7345a22c0247b2df08941325f685ad0b754634e6fdc7a8e415385", "0xb785b1e47a9801e67ca8309a43d77def71fad1850842db705b117036c87f57e5",
// 		  "0x2a32430f590cb19d2c0d858103741313b07495be94cb9ab750e5df4a59d8ab13", "0xa85303752b9abb641cb66571a273f4c9e423d66b6af6a2765fb2ba6d3cc14c9c",
// 		  "0x178d08a259e63d17c5f12732e51b60c3eab31a3a515ce2bc5c0b79409d93d30e", "0x1ef1ea9259a600ef8f965cb3973fb5f8080ba0981a03d2664179ac8f0d576406",
// 		  "0xbe6664861c8e049ecb5790511e0004ea3d8c3b43ceccbd22231857f5614c7c95", "0x4769685dac94cec5ebbf1b8adfeff2837f0df6657efe8c1190af4db07a7eaab1",
// 		  "0x15560c7a954539e3c66056bb30a1ef62c4629825766b07c18c9ee9ba49454cb6", "0x3112c90edc5ae778081f7eae009fe81ccc5e89f63f70b5b7cf24e6fe3847017d",
// 		  "0x41a0ef8b5e026852d0081cfbb52cbb19a586cc140127b0607dd4ad2cced91cd1", "0xc79ec74aa58ff377cda677db2da390d1f40e16a72b9a3c2f3b2c55ff8a1d2dae",
// 		  "0x1a55acd97eab5f4e55ce4a78dea432f7687ecf0994e776488b1410c17ce18f08", "0xc8a35661bcde4ca69cecd4e20ccf6d1c38f7e234afaa8c755df03485c6adf3de",
// 		  "0xaf56704f2e68a2068631fc1dac419b50d8201b23be97645795f0e57776282a0a", "0x160af79f803f67449b85bb146381dd8e6042d39751e0b3831d414e209ac00a51",
// 		  "0x03179b5c363567e35b2d44b070a55cf856d83298a70057103b97c9f7038cd87b", "0x204d431b9fd331380dda17903c1d14e18e801e7c6467d6999593eb65e823d6af",
// 		  "0x826ee00f6b56abfc1d4ac4e8a6ed8b05a346012abcbdfa7c407fe89bfd5bb224", "0x0c112ce3b4b2f0a1956f902a26fe77da2ffc45e7964e815d8de87ea759252bb4",
// 		  "0x0070a2ea1f1420db37eea697df7ec45b22b26da4130bc0f61b7bc99bde832fa6", "0x970cdc4a27713bfc64670406ada5911bce499a61b52ab755f4fbb547701bdf17",
// 		  "0x76307487946bb20cdb2b95560b0cd72601d703eda8dd3de6e8b37130639d3ba1", "0xff54915f15677d98310e300cdf73055a47ff24710a48342225151fa27e283aef",
// 		  "0x69eecc684348c834fdf786a23a2c0d7bf2b6701c951fab54aaba1b4ae870b642", "0xb66f590de840a0b68b431ba1c4c7d493d9bb7996b8f92817627ae91ff85f94fa",
// 		  "0xb80a25a75b776c82785397580dd70dd8cbdc0cbd728ace1bc8644e0fd36fde94"
// 		],
// 		value: "0x0000000000000000000000000000000000000000000000000000000000000002",
// 	  },
// 	  {
// 		index: 0,
// 		key: "0x0000000000000000000000000000000000000000000000000000000000000001",
// 		proof: [
// 		  "0x0ac46d73f8f544bb3ab5110ad75e10b8d3e230f2752a259a1a944ede20f66754", "0xa05370fba2acffaee795e0feb7976a8aed3cedd6ec269bfee40e8e40caa80622",
// 		  "0x4eccace9ead9ea53815de539311c775a666cca774257bf4d7a987a77e5db7ce2", "0x986ab0e57b423de78c1e8c80e07a56f7ebf782c304d0f386ff1aae2137d9b206",
// 		  "0x84cd7642e895ce7bf539f3ba8397c5f844743865f6c55800687bfd4da1440eac", "0x8046d9e5a870b1ce41390f1fefe8a3b1bfc059202327234a33879ed035b52d2f",
// 		  "0xd33d5cd16b8e0cfe2daf85b6aed3dc8d42f7df3b4002a5c77e05bace10ab5297", "0x24f97280d0e2cf79e9b43606064038e04f59e06cc1f0630c07ed8c464b60a3ff",
// 		  "0xa482726a27aedf2c556a9b052c017c2b9310a308156797e60c81db3b8eb7cd9d", "0xff9e617f836c7e5fde6ed6fc13280d23b2b3fb4a8373a59ba7d6f77874eeebef",
// 		  "0xf5866084091f0b429b04267eba79c316b00bdfef334cad9de0035ee1d05dfd0c", "0x13ed84a066df84c9d693a3ee77acfa886c9eabeb6613477b3a38f5c5b059c769",
// 		  "0x94805f9ba591f2241c6f0a9ef41c4adb25e99854de7d09fec4dc8d66b1297b1f", "0x4deb85d5242e51426b9e208607489e5bdf8c8a693876d3c6b0d989fa1428c8d1",
// 		  "0xab633f396262be29921a0a6a62ae1f0fdc9b121a44018a4c66ad93deff9ee51b", "0xaad9ed49babb4ef811c0574b895aba2add52d87de1db1936ea2f4c7b2e7ee9e4",
// 		  "0x4ece05d103e00cd5acdfff3aaf09f5df202be90559aef7d6817bfb09e8b4d93c", "0x4e178928b86aa69c4e8765793b7bb05b6f861c884e08d5438de36eb0bf1d8ba3",
// 		  "0xdfd9b52e5f4d27575ffbff5a7494c9a9d7f9312d1aad40f50bfeda8507aec961", "0x1208e16f1533aa5c6fe35ffc2e95c1e5eadd84b21cb95d5c91de833fe6bf806d",
// 		  "0xb677bcedac0612f5ddd3ebb83b3779ffccf7de87acfaafd27eaf9b6a21a12310", "0xd7558e84508179091c38f8a505b3013f4c82309bc405f7057184197bbefdddd0",
// 		  "0x36c4629023f5eb1f44e9639af5f8389b1f016d4ecc6a1887b1da7c7e5bb98f9e", "0x8ff75aed27422f86d451b0f35a5060b05812ff26f784649fdd2b935a6c61ed6a",
// 		  "0x26168617776a3a21b6428877a381ab45b8c2dc241da695f3e4c802ee03728106", "0xde07174d215228fb80fc4392b3ece29b297710475d41065ac381add2eef474aa",
// 		  "0xb7dfdb40095c4d20f6d4c52ea7e68e7f50bea6f5cfbe614399703443c2ac734a"
// 		],
// 		value: "0x0000000000000000000000000000000000000000000000000000000000000000",
// 	  }
// 	],
// }

*/
