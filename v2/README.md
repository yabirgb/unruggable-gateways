# EVMGateway (v2)

`$ npm i @unruggable/evmgateway` [&check;](https://www.npmjs.com/package/@unruggable/evmgateway)

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

## Serve

* `bun run serve <chain> [port]`
	* Chain names: `base op arb1 linea polygon scroll taiko zksync blast fraxtal zora`
	* Default port: `8000`

## Test

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

* [enschain](./test/examples/enschain/) &rarr; [ensdomains/**enschain**](https://github.com/ensdomains/enschain/)
	* `bun test/examples/enschain/demo.ts`
* [ENSv2](./test/examples/ENSv2/)
	* copy [`contracts/`](https://github.com/unruggable-labs/ENS-V2/tree/main/contracts)
	* `bun test/examples/ENSv2/demo.ts`
* [TeamNick](./test/examples/TeamNick/)
	* `bun test/examples/TeamNick/fetch.ts`
		* write requests [in JS](./test/examples//TeamNick/fetch.ts) to quickly iterate
	* `bun test test/examples/TeamNick/resolver.test.ts`
		* [port to Solidity](./test/examples/TeamNick/TeamNick.sol) and write tests [in JS](./test/examples/TeamNick/resolver.test.ts) to validate
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
forge install openzeppelin-contracts-v4.9=OpenZeppelin/openzeppelin-contracts@release-v4.9 # required for ens-contracts
forge install ensdomains/ens-contracts
forge install ensdomains/buffer
forge install OpenZeppelin/openzeppelin-contracts@master # https://github.com/OpenZeppelin/openzeppelin-contracts/pull/4845
forge install ethereum-optimism/optimism@v1.8.0
forge install offchainlabs/nitro-contracts
forge install ensdomains/enschain
# forge install taikoxyz/taiko-mono # using inline headers instead
```
