# EVMGateway (v2)

## Setup

1. [`foundryup`](https://book.getfoundry.sh/getting-started/installation)
1. `forge install`
1. `bun i`
1. create [`.env`](./.env.example)

#### Forge Setup
```
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
forge install ensdomains/ens-contracts
forge install ensdomains/buffer
forge install ethereum-optimism/optimism@develop
forge install offchainlabs/nitro-contracts
```

## Test

* `bun run test-components`
* `bun run test-gateways`

## Examples

* ENSv2
	* copy [`contracts/`](https://github.com/unruggable-labs/ENS-V2/tree/main/contracts)
	* `bun test/examples/ENSv2/storage.ts`
* TeamNick
	* `bun test/examples/TeamNick/fetch.ts`
	* `bun test test/examples/TeamNick/resolver.test.ts`

## Serve

* `bun run serve [base|op|arb1|scroll]`
