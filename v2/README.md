# EVMGateway (v2)

## Setup

1. [`foundryup`](https://book.getfoundry.sh/getting-started/installation)
1. `forge install`
1. `bun i`
1. create [`.env`](./.env.example)

#### Forge Setup
```sh
# installed by forge in step (2)
# provided for reference
forge install foundry-rs/forge-std
forge install openzeppelin-contracts-v4.9=OpenZeppelin/openzeppelin-contracts@release-v4.9 # required for ens-contracts
forge install ensdomains/ens-contracts
forge install ensdomains/buffer
forge install OpenZeppelin/openzeppelin-contracts@master # https://github.com/OpenZeppelin/openzeppelin-contracts/pull/4845
forge install ethereum-optimism/optimism@develop # https://github.com/ethereum-optimism/optimism/pull/10819
forge install offchainlabs/nitro-contracts
forge install ensdomains/enschain
```

## Test

* `bun run test`
	* `bun run test-components`
		* [Supported Operations](./test/components/ops.test.ts)
		* [Protocol Limits](./test/components/limits.test.ts)
		* [Batched eth_getProof](./test/components/proofs.test.ts)
	* `bun run test-gateways`
		* [Contract](./test/gateway/SlotDataContract.sol) &rarr; [Reader](./test/gateway/SlotDataReader.sol) &rarr; [Tests](./test/gateway/tests.ts)
		* ⚠️ Scroll fails [`readZero()`](./test/gateway/tests.ts#L26) test

## Examples

* [enschain](./test/examples/enschain/) &rarr; [ensdomains/**enschain**](https://github.com/ensdomains/enschain/)
	* `bun test/examples/enschain/demo.ts`
* [ENSv2](./test/examples/ENSv2/)
	* copy [`contracts/`](https://github.com/unruggable-labs/ENS-V2/tree/main/contracts)
	* `bun test/examples/ENSv2/storage.ts`
* [TeamNick](./test/examples/TeamNick/)
	* `bun test/examples/TeamNick/fetch.ts`
		* write requests [in JS](./test/examples//TeamNick/fetch.ts) to quickly iterate
	* `bun test test/examples/TeamNick/resolver.test.ts`
		* [port to Solidity](./test/examples/TeamNick/TeamNick.sol) and write tests [in JS](./test/examples/TeamNick/resolver.test.ts) to validate

## Serve

* `bun run serve <chain> [port]`
	* Supported chains: `base op arb1 scroll`
	* Default port: `8000`
