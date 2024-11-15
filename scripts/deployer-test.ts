import { FoundryDeployer } from '@adraffy/blocksmith';
import { createProvider } from '../test/providers.js';
import { CHAINS } from '../src/chains.js';
import { Wallet } from 'ethers/wallet';

const foundry = await FoundryDeployer.load({
  wallet: new Wallet(process.env.PRIVATE_KEY!, createProvider(CHAINS.TAIKO)),
});

const data = await foundry.prepare({
  file: 'SlotDataContract',
});

console.log(data);
const { contract } = await data.deploy();
await data.verifyEtherscan();

const pointer = await foundry.prepare({
  file: 'SlotDataPointer',
  args: [contract],
});

console.log(pointer);
await data.deploy();
await data.verifyEtherscan();
