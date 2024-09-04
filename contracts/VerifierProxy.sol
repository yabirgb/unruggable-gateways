// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

/**
 * @title Custom Proxy with Integrated Config Storage
 * Extends OpenZeppelin TransparentUpgradeableProxy to add safe configuration storage.
 */
contract VerifierProxy is TransparentUpgradeableProxy {

    /**
     * @dev Appropriately namespaced storage slot definition for our configuration storage
     */
    bytes32 private constant _CONFIG_SLOT = keccak256("unruggable.proxy.config.storage.slot");

    /**
     * @dev Storage slot 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103 (obtained as bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)).
     * See https://eips.ethereum.org/EIPS/eip-1967
    */
    bytes32 private constant _ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    /**
     * @dev Storage slot with the address of the current implementation.
     * This is the keccak-256 hash of "eip1967.proxy.implementation" subtracted by 1, and is
     * validated in the constructor.
     */
    bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;


    modifier isAdminOwner() {
        require(msg.sender == ProxyAdmin(_admin()).owner(), "Only ProxyAdmin owner can call this function");
        _;
    }


    /**
     * @dev Constructor to initialize the proxy with the implementation, admin, and init data
     */
    constructor(
        address _logic,
        address admin_,
        bytes memory _data
    ) TransparentUpgradeableProxy(_logic, admin_, _data) {}


    /**
    * @dev Sets a configuration value of any type by key, encoded as bytes.
    * Uses a unique storage slot to avoid collisions with implementation storage.
    * Restricted to admin only by default due to TransparentUpgradeableProxy behavior.
    */
    function setConfig(bytes32 key, bytes calldata value) external isAdminOwner {

        bytes32 slot = keccak256(abi.encodePacked(_CONFIG_SLOT, key));

        // Copy the calldata to memory first
        bytes memory memValue = value;

        // Store the length of the data
        uint256 dataLength = memValue.length;
        assembly {
            sstore(slot, dataLength)
        }

        // Store the data in chunks of 32 bytes
        for (uint256 i = 0; i < dataLength; i++) {
            // Calculate the slot position for the current chunk
            bytes32 tempSlot = keccak256(abi.encodePacked(slot, i+1));
            assembly {
                sstore(tempSlot, mload(add(add(memValue, 0x20), i)))
            }
        }
    }


    /**
     * @dev Returns a configuration value encoded as bytes based on its key.
     */
    function getConfig(bytes32 key) external view returns (bytes memory value) {
        bytes32 slot = keccak256(abi.encodePacked(_CONFIG_SLOT, key));
        uint256 dataLength;

        // Retrieve the length of the data
        assembly {
            dataLength := sload(slot)
        }

        // Allocate space for the returned bytes data
        value = new bytes(dataLength);

        // Retrieve each chunk of data and append it to the return value
        for (uint256 i = 0; i < dataLength; i++) {
            bytes32 tempSlot = keccak256(abi.encodePacked(slot, i+1));
            assembly {
                mstore(add(add(value, 0x20), i), sload(tempSlot))
            }
        }
    }

    /**
     * @dev Returns the address of the admin.
     */
    function _admin() public view returns (address adminAddress) {
        bytes32 slot = _ADMIN_SLOT;
        assembly {
            adminAddress := sload(slot)
        }
    }

    /**
     * @dev Returns the address of the implementation.
     */
    function _impl() public view returns (address implementationAddress) {
        bytes32 slot = _IMPLEMENTATION_SLOT;
        assembly {
            implementationAddress := sload(slot)
        }
    }

    /**
     * @dev Returns a static value. Implemented at the proxy level.
     */
    function staticReadProxyLevel() public view returns (bytes memory) {  
        
        return abi.encodePacked("pRoXyLeVeL");
    }
}