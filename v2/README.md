# EVMGateway (v2)

## Setup

1. [`foundryup`](https://book.getfoundry.sh/getting-started/installation)
1. `forge install`
1. `bun i`
1. create [`.env`](./.env.example)

#### Forge Setup
```
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts@release-v4.9
forge install ensdomains/ens-contracts
forge install ensdomains/buffer
forge install ethereum-optimism/optimism@develop
forge install offchainlabs/nitro-contracts
```

## Test

* `bun run test-components`
* `bun run test-gateways`

