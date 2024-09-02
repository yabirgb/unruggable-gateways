/// @author raffy.eth
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

// interfaces
import {ENS} from "@ensdomains/ens-contracts/contracts/registry/ENS.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IExtendedResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IExtendedResolver.sol";
import {IAddrResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IAddrResolver.sol";
import {IAddressResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IAddressResolver.sol";
import {ITextResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/ITextResolver.sol";

// libraries
import {BytesUtils} from "@ensdomains/ens-contracts/contracts/wrapper/BytesUtils.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {EVMFetcher, EVMRequest} from "@ensdomains/evmgateway/contracts/EVMFetcher.sol";

// bases
import {EVMFetchTarget, IEVMVerifier} from "@ensdomains/evmgateway/contracts/EVMFetchTarget.sol";

contract TeamNick is IERC165, IExtendedResolver, EVMFetchTarget {
	using BytesUtils for bytes;
	using EVMFetcher for EVMRequest;

	error Unreachable(bytes name);

	ENS immutable _ens;
	IEVMVerifier immutable _verifier;

	uint256 constant SLOT_RECORDS = 7;
	uint256 constant SLOT_SUPPLY = 8;

	address constant TEAMNICK_ADDRESS = 0x7C6EfCb602BC88794390A0d74c75ad2f1249A17f;

	constructor(ENS ens, IEVMVerifier verifier) {
		_ens = ens;
		_verifier = verifier;
	}

	function supportsInterface(bytes4 x) external pure returns (bool) {
		return x == type(IERC165).interfaceId || x == type(IExtendedResolver).interfaceId;
	}

	function _resolveBasename(bytes calldata data) internal view returns (bytes memory) {
		bytes4 selector = bytes4(data);
		if (selector == IAddrResolver.addr.selector) {
			return abi.encode(address(0));
		} else if (selector == IAddressResolver.addr.selector) {
			(, uint256 cty) = abi.decode(data[4:], (bytes32, uint256));
			if (cty == 0x80002105) { // base (8453) {
				return abi.encode(abi.encodePacked(TEAMNICK_ADDRESS));
			}
		} else if (selector == ITextResolver.text.selector) {
			(, string memory key) = abi.decode(data[4:], (bytes32, string));
			bytes32 keyhash = keccak256(bytes(key));
			if (keyhash == keccak256("url")) {
				return abi.encode("https://teamnick.xyz");
			} else if (keyhash == keccak256("description")) {
				fetch(_verifier, EVMFetcher.newRequest(1).setTarget(TEAMNICK_ADDRESS).setSlot(SLOT_SUPPLY).read().setOutput(0), this.descriptionCallback.selector, '');
			}
		}
		return new bytes(64);
	}

	function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
		uint256 offset = _findSelf(name);
		if (offset == 0) return _resolveBasename(data);
		(bytes32 label, uint256 pos) = name.readLabel(0);
		uint256 token = pos == offset ? uint256(label) : 0;
		bytes4 selector = bytes4(data);
		if (selector == IAddrResolver.addr.selector) {
			fetch(_verifier, EVMFetcher.newRequest(1).setTarget(TEAMNICK_ADDRESS).setSlot(SLOT_RECORDS).push(token).follow().read().setOutput(0), this.addrCallback.selector, '');
		} else if (selector == IAddressResolver.addr.selector) {
			(, uint256 cty) = abi.decode(data[4:], (bytes32, uint256));
			if (cty == 60) {
				fetch(_verifier, EVMFetcher.newRequest(1).setTarget(TEAMNICK_ADDRESS).setSlot(SLOT_RECORDS).push(token).follow().readBytes().setOutput(0), this.addressCallback.selector, '');
			}
		} else if (selector == ITextResolver.text.selector) {
			(, string memory key) = abi.decode(data[4:], (bytes32, string));
			bytes32 keyhash = keccak256(bytes(key));
			if (keyhash == keccak256("name")) {
				return abi.encode(name[1:pos]);
			} else if (keyhash == keccak256("avatar")) { 
				fetch(_verifier, EVMFetcher.newRequest(1).setTarget(TEAMNICK_ADDRESS).setSlot(SLOT_RECORDS).push(token).follow().offset(1).readBytes().setOutput(0), this.textCallback.selector, '');
			}
		}
		return new bytes(64);
	}
	
	function _findSelf(bytes memory name) internal view returns (uint256 offset) {
		unchecked {
			while (true) {
				bytes32 node = name.namehash(offset);
				if (_ens.resolver(node) == address(this)) break;
				uint256 size = uint8(name[offset]);
				if (size == 0) revert Unreachable(name);
				offset += 1 + size;
			}
		}
	}

	function addrCallback(bytes[] calldata values, uint8, bytes calldata) external pure returns (bytes memory) {
		return abi.encode(bytes32(values[0]));
	}
	function addressCallback(bytes[] calldata values, uint8, bytes calldata) external pure returns (bytes memory) {
		return abi.encode(values[0][12:]);
	}
	function textCallback(bytes[] calldata values, uint8, bytes calldata) external pure returns (bytes memory) {
		return abi.encode(values[0]);
	}
	function descriptionCallback(bytes[] calldata values, uint8, bytes calldata) external pure returns (bytes memory) {
		return abi.encode(string.concat(Strings.toString(uint256(bytes32(values[0]))), " names registered"));
	}
	
} 