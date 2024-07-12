import { ethers } from 'ethers';
import { Foundry } from '@adraffy/blocksmith';
import { EVMProver, EVMRequest } from '../../../src/vm.js';

const foundry = await Foundry.launch();

const resolver = await foundry.deploy({ import: '@ensdomains/ens-contracts/contracts/resolvers/OwnedResolver.sol' });

const node = ethers.namehash('raffy.eth');
const key = 'name';

await foundry.confirm(resolver.clearRecords(node));
await foundry.confirm(resolver.setText(node, key, 'Raffy'));

const prover = await EVMProver.latest(foundry.provider);

// find versions => 1
{
  const req = new EVMRequest();
  req.setTarget(resolver.target);
  const iNode = req.addInputBytes(node);
  for (let i = 0; i < 20; i++) {
    req.setSlot(i)
      .pushInput(iNode).follow()
      .read().addOutput();	
  }
  const vm = await prover.evalRequest(req);
  const values = await vm.resolveOutputs();
  values.forEach((x, i) => console.log(i, x));
}

// find text mapping => 11
{
  const req = new EVMRequest();
  req.setTarget(resolver.target);
  const iVersion = req.addInput(1);
  const iNode = req.addInputBytes(node);
  const iKey = req.addInputStr(key);
  for (let i = 0; i < 20; i++) {
    req.setSlot(i)
      .pushInput(iVersion).follow()
      .pushInput(iNode).follow()
      .pushInput(iKey).follow()
      .readBytes().addOutput();	
  }
  const vm = await prover.evalRequest(req);
  const values = await vm.resolveOutputs();
  values.forEach((x, i) => console.log(i, x));
}

foundry.shutdown();
