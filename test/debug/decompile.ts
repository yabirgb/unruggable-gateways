import { GatewayRequest } from '../../src/vm.js';
import { ProgramReader } from '../../src/reader.js';
import { dataLength } from 'ethers/utils';

// TODO: decompiler should execute machine
// eg. OP_TARGET shows value from stack

const req = new GatewayRequest(1)
  .setTarget('0x51050ec063d393217B436747617aD1C2285Aeeee')
  .setSlot(200)
  .pushStr('chonk')
  .follow()
  .readBytes()
  .setOutput(0);

const encoded = req.encode();
console.log(encoded);
console.log(`Bytes: ${dataLength(encoded)}`);

console.log('\n[inputs]');
req.inputs.forEach((hex, i) => console.log(i.toString().padStart(3), hex));

console.log('\n[ops]');
for (const action of ProgramReader.actions(req)) {
  const { pos, op, name, ...a } = action;
  console.log(
    pos.toString().padStart(3),
    op.toString().padStart(3),
    name,
    `${Object.entries(a)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`
  );
}
