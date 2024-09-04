import { encodeBytes32String, Interface, Contract, toUtf8String } from 'ethers';
import { Foundry } from '@adraffy/blocksmith';
import { OPFaultRollup } from '../../../src/op/OPFaultRollup.js';
import { createProviderPair } from '../../providers.js';
import { ABI_CODER } from '../../../src/utils.js';

const foundry = await Foundry.launch({
  /*procLog: true, infoLog: true*/
});

const adminWallet = foundry.requireWallet('admin');
console.log('Wallet: ', adminWallet.address);

const anotherWallet = await foundry.createWallet();

//Helper for deploying implementation contracts
async function deployImplementation(value: string) {
  return foundry.deploy({
    file: 'TestImplementation',
    args: [value],
  });
}

const config = OPFaultRollup.mainnetConfig;
const rollup = await OPFaultRollup.create(createProviderPair(config), config);

const gatewayUrlsBytes = ABI_CODER.encode(
  ['string[]'],
  [['http://localhost:3000']]
);
const windowBytes = ABI_CODER.encode(['uint256'], [rollup.defaultWindow]);
const rollupAddressBytes = ABI_CODER.encode(
  ['address'],
  [config.OptimismPortal]
);

async function deployProxy(name: string, implementation: Contract) {
  return foundry.deploy({
    file: 'VerifierProxy',
    args: [
      implementation.target,
      adminWallet.address,
      '0x',
      gatewayUrlsBytes,
      windowBytes,
      rollupAddressBytes,
    ],
  });
}

//Deploy the first implementation
const firstImplementation = await deployImplementation('FiRsT');
console.log('First Implementation: ', firstImplementation.target);

//Deploy the first proxy, specify the initial implementation
const firstProxy = await deployProxy('FirstProxy', firstImplementation);
console.log('First Proxy: ', firstProxy.target);

//Admin is automatically wapped in ProxyAdmin instance
const firstProxyAdmin = await firstProxy._admin();
console.log('First Proxy Admin: ', firstProxyAdmin);

//Encode a key and value appropriately for example configuration
const configKey = encodeBytes32String('key');
const configValue = '0x' + Buffer.from('hello-ONE').toString('hex');

//This will fail as the admin is wrapped in ProxyAdmin in the constructor of the proxy
await foundry.confirm(firstProxy.setConfig(configKey, configValue));

const proxyAsAnother = new Contract(
  firstProxy.target,
  firstProxy.interface,
  anotherWallet
);

//This should fail as anotherWallet is not the owner of ProxyAdmin
try {
  await proxyAsAnother.setConfig(configKey, configValue);
} catch (e) {
  console.log('Error (EXPECTED): ', e.message);
}

//Confirm the configuration was set
const setConfigValue = await firstProxy.getConfig(configKey);
console.log('Set Config Value: ', setConfigValue);

//Define the ABI of methods we want to call
const newABI = [
  //At the implementation level
  'function getValue() public view returns (string memory)',
  'function readFromConfig() public view returns (bytes memory)',
  //At the proxy level
  'function staticReadProxyLevel() public view returns (bytes memory)',
];

// Create a new interface
const newInterface = new Interface(newABI);

// Extend the existing contract
const extendedContract = new Contract(
  firstProxy.target,
  newInterface,
  foundry.provider
);

const staticValue = await extendedContract.staticReadProxyLevel();
console.log('Static Value (proxy level): ', staticValue);

//This will be null as we are calling from the proxy and using proxy storage
const implementationIdentifier = await extendedContract.getValue();
console.log('Implementation ID: ', implementationIdentifier);

const valueFromConfig = await extendedContract.readFromConfig();
console.log(
  'Config value (implementation level): ',
  toUtf8String(valueFromConfig)
);

//Deploy the second proxy, specify the initial implementation
const secondProxy = await deployProxy('SecondProxy', firstImplementation);
console.log('Second Proxy: ', secondProxy.target);

//Encode a key and value appropriately for example configuration
const configValueTwo = '0x' + Buffer.from('hello-TWO').toString('hex');

await foundry.confirm(secondProxy.setConfig(configKey, configValueTwo));

//Confirm the configuration was set
const setConfigValueTwo = await secondProxy.getConfig(configKey);
console.log('Set Config Value Two: ', setConfigValueTwo);

// Extend the existing contract
const extendedContractTwo = new Contract(
  secondProxy.target,
  newInterface,
  foundry.provider
);

const staticValueTwo = await extendedContractTwo.staticReadProxyLevel();
console.log('Static Value TWO (proxy level): ', staticValueTwo);

const valueFromConfigTwo = await extendedContractTwo.readFromConfig();
console.log(
  'Config value TWO (implementation level): ',
  toUtf8String(valueFromConfigTwo)
);

//Deploy the second implementation
const secondImplementation = await deployImplementation('sEcOnD');
console.log('Second Implementation: ', secondImplementation.target);

// Connect to the ProxyAdmin contract
const proxyAdmin = new Contract(
  firstProxyAdmin,
  [
    'function upgradeAndCall(address proxy, address implementation, bytes memory data)',
  ], // ABI fragment
  adminWallet
);

console.log('Proxy Admin: ', proxyAdmin.target);
console.log('firstProxyAdmin: ', firstProxyAdmin);
console.log('firstProxy.target: ', firstProxy.target);
console.log('secondImplementation.target: ', secondImplementation.target);

// Confirm the upgrade
const implementationAddressBefore = await firstProxy._impl();
console.log(
  'Current Implementation Address Before (from proxy):',
  implementationAddressBefore
);

// Perform the upgrade
await proxyAdmin.upgradeAndCall(
  firstProxy.target,
  secondImplementation.target,
  '0x'
);

// Confirm the upgrade
const implementationAddressFromProxy = await firstProxy._impl();
console.log(
  'Current Implementation Address (from proxy):',
  implementationAddressFromProxy
);

foundry.shutdown();
