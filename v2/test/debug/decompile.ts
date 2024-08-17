import { EVMRequest, ProgramReader } from '../../src/vm';

// TODO: decompiler should execute machine
// eg. OP_TARGET shows value from stack

const req = new EVMRequest(1)
  .setTarget('0x51050ec063d393217B436747617aD1C2285Aeeee')
  .setSlot(420)
  .pushStr('chonk')
  .follow()
  .readBytes()
  .setOutput(0);

for (const action of ProgramReader.fromProgram(req).readActions()) {
  const { pos, op, name, ...a } = action;
  console.log(
    pos.toString().padStart(3),
    op.toString().padStart(3),
    name,
    `[${Object.entries(a)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ')}]`
  );
}
