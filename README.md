<p align="center">
    <img src="https://raw.githubusercontent.com/unruggable-labs/unruggable-gateways/main/unruggable-logo-black.png" style = "width:300px;" alt = "Unruggable Gateways" />
</p>

# Unruggable Gateways 

This repository provides an end-to-end code solution for resolving data from rollup chains and verifying it against state posted to Layer 1 Ethereum.

![Unruggable Gateways CI](https://github.com/unruggable-labs/unruggable-gateways/actions/workflows/unruggable-gateways.yml/badge.svg)

## Quickstart

Install our npm package:

`$ npm i @unruggable/gateways` [&check;](https://www.npmjs.com/package/@unruggable/unruggable-gateways)

We have extensive [documentation](https://gateway-docs.unruggable.com), with a slightly less quick [Quickstart](https://gateway-docs.unruggable.com/quickstart). 

The [examples](https://gateway-docs.unruggable.com/examples) page may be of particular interest. 

We also have an [examples repo](https://github.com/unruggable-labs/gateway-examples) that utilises our npm package to demonstrate both simple and complex use cases in a few clicks.

## Architecture

The core components of a chain solution are:

- **Gateway**: A HTTP server that handles responding to a virtual machine request by interfacing with the appropriate rollup to return proofs of the requested data stored on that chain.
- **Verifier**: A Solidity smart contract (deployed on Layer 1) that verifies the proofs returned by the gateway and returns the proven data values.
- **Prover**: A Solidity library (deployed on Layer 1) that handles the chain-specific proving process.

In addition to these core components, we have provided TypeScript implementations of the request builder ([vm.ts](https://github.com/unruggable-labs/unruggable-gateways/blob/main/src/vm.ts)) and the provers (listed below) to allow smart contract implementors to quickly iterate and test when building solutions.

## Chain Support

There are currently implementations for the following chains:

```bash
Arbitrum
Base
Blast
Fraxtal
Linea
Optimism
Polygon PoS
Scroll
Taiko
ZKSync
Zora
```

If you are interested in building out a solution for another chain, please take a look at our our [Contribution Guidelines](#contribution-guidelines) and/or [get in touch](https://unruggable.com/contact).

## Setup

1. [`foundryup`](https://book.getfoundry.sh/getting-started/installation)
1. `forge install`
1. `bun i`
1. create [`.env`](./.env.example)

## Support
* Provers
	* [EthProver](./src/eth//EthProver.ts) &rarr; `eth_getProof`
	* [LineaProver](./src/linea/LineaProver.ts) &rarr; `linea_getProof`
	* [ZKSyncProver](./src/zksync/ZKSyncProver.ts) &rarr; `zks_getProof`
* Rollups: 
	* [OP](./src/op/OPRollup.ts) &mdash; Base, Blast, Fraxtal, Zora
	* [OP w/Fault Proofs](./src/op/OPFaultRollup.ts) &mdash; OP Mainnet
	* [Nitro](./src/nitro/NitroRollup.ts) &mdash; Arbitrum One
	* [Linea](./src/linea/LineaRollup.ts)
	* [Polygon PoS](./src/polygon/PolygonPoSRollup.ts)
	* [Polygon ZK](./src/polygon/PolygonZKRollup.ts) &mdash; *WIP*
	* [Scroll](./src/scroll/ScrollRollup.ts)
	* [Taiko](./src/taiko/TaikoRollup.ts)
	* [ZKSync](./src/zksync/ZKSyncRollup.ts)

## Running a Gateway

* `bun run serve <chain> [port]`
	* Chain names: `arb1` `base` `blast` `fraxtal` `linea` `op` `polygon` `scroll` `taiko` `zksync` `zora`
	* Default port: `8000`

## Testing

There is an extensive test suite available for testing individual components of the solution in an isolated manner. 

Using [blocksmith.js](https://github.com/adraffy/blocksmith.js/) and [Foundry](https://getfoundry.sh/) we fork the chain in question (such that can interact with contracts deployed on a real network) and then deploy and test against an isolated unit (for example the chain specific verifier).

Commands available include:

* `bun run test`
	* `bun run test-components`
		* [Supported Operations](./test/components/ops.test.ts)
		* [Protocol Limits](./test/components/limits.test.ts)
		* [Batched `eth_getProof`](./test/components/proofs.test.ts)
	* `bun run test-gateways`
		* [Contract](./test/gateway/SlotDataContract.sol) &rarr; [Reader](./test/gateway/SlotDataReader.sol) &rarr; [Tests](./test/gateway/tests.ts)
		* ⚠️ Scroll fails [`readZero()`](./test/gateway/tests.ts#L26) test
		* ⚠️ Polygon has poor `eth_getProof` support

## Examples

A number of examples are provided as part of this repository. For more extensive step-wise example code, please see our [documentation](https://gateway-docs.unruggable.com/examples).

* [linea-ens](./test/v1/linea-ens.ts)
	* Replacement backend demo for https://names.linea.build/
	* `bun serve lineaV1`

## Notes

#### Suggested VSCode Extensions

* [JuanBlanco.solidity](https://marketplace.visualstudio.com/items?itemName=JuanBlanco.solidity)
* [esbenp.prettier-vscode](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
* [dbaeumer.vscode-eslint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)

#### Forge Setup
```sh
# installed by forge in step (2)
# provided for reference
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2

# installed by script instead of the following command
# placed at standard remapping location
# see: https://github.com/ethereum-optimism/optimism/issues/10202
#forge install ethereum-optimism/optimism
bun build/import-op.ts
```

## Contribution Guidelines

We welcome contributions to this codebase. 

The premise behind the development of this software is to minimise duplication of effort and provide tooling that allows developers to interface with a simple, standardised API to read data from other chains.

Please take a look at our [CONTRIBUTING.md](https://github.com/unruggable-labs/unruggable-gateways/blob/main/CONTRIBUTING.md) file for a more in depth overview of our contribution process.

## Release Process

### Branching strategy

* [main](https://github.com/unruggable-labs/unruggable-gateways/tree/main) is our stable release branch that reflects the latest release.
* [develop](https://github.com/unruggable-labs/unruggable-gateways/tree/develop) is our ongoing development branch. Feature branches are to merged down into this.
* Feature Branches: Separate branches will be utilised for new feature development or bug fixes.

## License

All files within this repository are licensed under the [MIT License](https://github.com/ethereum-optimism/optimism/blob/master/LICENSE) unless stated otherwise.
