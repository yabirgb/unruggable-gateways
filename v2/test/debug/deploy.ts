import { Foundry } from '@adraffy/blocksmith';
import { ethers } from 'ethers';

const foundry = await Foundry.launch({
  infoLog: true,
});

//await foundry.deploy({ file: 'EVMProver ' });

await foundry.deploy({
  sol: `
    import "@src/EVMProver.sol";
    contract Prover {
      function f() external returns (bytes[] memory, uint8) {
        EVMRequest memory r;
        ProofSequence memory s;
        return EVMProver.evalRequest(r, s);  
      }
    }
  `,
});

await foundry.deploy({ file: 'EthSelfVerifier' });

await foundry.deploy({
  file: 'OPFaultVerifier',
  args: [[], 0, ethers.ZeroAddress, ethers.ZeroAddress],
});

foundry.shutdown();
