import { Foundry } from '@adraffy/blocksmith';

const foundry = await Foundry.launch({
  procLog: true,
});

const contract = await foundry.deploy({
  sol: `
		import "forge-std/console2.sol";
		contract X {
			function f() external view {
				console2.log("CHONK", "A", "B");
				console2.logBytes32(keccak256(bytes("ABC")));
			}
		}
	`,
});

console.log(await contract.f());
console.log(await contract.f());
console.log(await contract.f());
console.log(await contract.f());

foundry.shutdown();
