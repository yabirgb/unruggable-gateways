// https://github.com/scroll-tech/scroll/blob/738c85759d0248c005469972a49fc983b031ff1c/contracts/src/libraries/verifier/ZkTrieVerifier.sol#L259

// https://github.com/scroll-tech/go-ethereum/blob/staging/trie/zk_trie.go#L176
// https://github.com/scroll-tech/zktrie/blob/main/trie/zk_trie_proof.go#L30
// https://github.com/ethereum/go-ethereum/blob/master/trie/proof.go#L114
// https://github.com/scroll-tech/mpt-circuit/blob/v0.7/spec/mpt-proof.md#storage-segmenttypes
 
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {NOT_A_CONTRACT} from "./ProofUtils.sol";

error InvalidProof();

//import "forge-std/console2.sol";

library ZkTrieHelper {
	
	// 20240622
	// we no longer care (verify or require) about the magic bytes, as it doesn't do anything
	// https://github.com/scroll-tech/zktrie/blob/23181f209e94137f74337b150179aeb80c72e7c8/trie/zk_trie_proof.go#L13
	// bytes32 constant MAGIC = keccak256("THIS IS SOME MAGIC BYTES FOR SMT m1rRXgP2xpDI");

	function proveAccountState(address hasher, bytes32 stateRoot, address account, bytes[] memory proof) internal view returns (bytes32 storageRoot) {
		//bytes32 raw = bytes32(bytes20(account)); 
		bytes32 key = poseidonHash1(hasher, bytes32(bytes20(account))); // left aligned
		(bytes32 leafHash, bytes memory leaf) = walkTree(hasher, key, proof, stateRoot);
		// HOW DO I TELL THIS DOESNT EXIST?
		if (!isValidLeaf(leaf, 230, bytes32(bytes20(account)), key, 0x05080000)) revert InvalidProof();
		// REUSING VARIABLE #1
		bytes32 temp;
		assembly { temp := mload(add(leaf, 69)) } // nonce||codesize||0
		// REUSING VARIABLE #2
		assembly { stateRoot := mload(add(leaf, 101)) } // balance
		assembly { storageRoot := mload(add(leaf, 133)) }
		bytes32 codeHash;
		assembly { codeHash := mload(add(leaf, 165)) }
		bytes32 h = poseidonHash2(hasher, storageRoot, poseidonHash1(hasher, codeHash), 1280);
		h = poseidonHash2(hasher, poseidonHash2(hasher, temp, bytes32(stateRoot), 1280), h, 1280);
		// REUSING VARIABLE #3
		assembly { temp := mload(add(leaf, 197)) }
		h = poseidonHash2(hasher, h, temp, 1280);
		h = poseidonHash2(hasher, key, h, 4);
		if (leafHash != h) revert InvalidProof(); // InvalidAccountLeafNodeHash
		if (codeHash == keccak256('')) storageRoot = NOT_A_CONTRACT;
	}

	function proveStorageValue(address hasher, bytes32 storageRoot, uint256 slot, bytes[] memory proof) internal view returns (bytes32 value) {
		bytes32 key = poseidonHash1(hasher, bytes32(slot));
		(bytes32 leafHash, bytes memory leaf) = walkTree(hasher, key, proof, storageRoot);
		uint256 nodeType = uint8(leaf[0]);
		if (nodeType == 4) {
			if (!isValidLeaf(leaf, 102, bytes32(slot), key, 0x01010000)) revert InvalidProof();
			assembly { value := mload(add(leaf, 69)) }
			bytes32 h = poseidonHash2(hasher, key, poseidonHash1(hasher, value), 4);
			if (leafHash != h) revert InvalidProof(); // InvalidStorageLeafNodeHash
		} else if (nodeType == 5) {
			if (leaf.length != 1) revert InvalidProof();
			if (leafHash != 0) revert InvalidProof(); // InvalidStorageEmptyLeafNodeHash
			return 0;
		}
	}

	function isValidLeaf(bytes memory leaf, uint256 len, bytes32 raw, bytes32 key, bytes4 flag) internal pure returns (bool) {
		if (leaf.length != len) return false;
		bytes32 temp;
		assembly { temp := mload(add(leaf, 33)) }
		if (temp != key) return false; // KeyMismatch
		assembly { temp := mload(add(leaf, 65)) }
		if (bytes4(temp) != flag) return false; // InvalidCompressedFlag
		if (uint8(leaf[len - 33]) != 32) return false; // InvalidKeyPreimageLength	
		assembly { temp := mload(add(leaf, len)) }
		return temp == raw; // InvalidKeyPreimage
	}

	function walkTree(address hasher, bytes32 key, bytes[] memory proof, bytes32 rootHash) internal view returns (bytes32 expectedHash, bytes memory v) {
		expectedHash = rootHash;
		bool done;
		//console2.log("[WALK PROOF] %s", proof.length);
		for (uint256 i; ; i++) {
			if (i == proof.length) revert InvalidProof();
			v = proof[i];
			bool left = uint256(key >> i) & 1 == 0;
			uint256 nodeType = uint8(v[0]);
			//console2.log("[%s] %s %s", i, nodeType, left ? "L" : "R");
			if (done) {
				if (nodeType == 4) break; // || nodeType == 5
				revert InvalidProof(); // expected leaf
			} else if (nodeType < 6 || nodeType > 9 || v.length != 65) {
				revert InvalidProof(); // expected node
			}
			bytes32 l;
			bytes32 r;
			assembly {
				l := mload(add(v, 33))
				r := mload(add(v, 65))
			}
			bytes32 h = poseidonHash2(hasher, l, r, nodeType);
			if (h != expectedHash) revert InvalidProof();
			expectedHash = left ? l : r;
			// https://github.com/scroll-tech/zktrie/blob/23181f209e94137f74337b150179aeb80c72e7c8/trie/zk_trie_node.go#L30
			// 6 XX | 7 XB | 8 BX | 9 BB
			if (nodeType == 6 || (left ? nodeType == 7 : nodeType == 8)) {
				//console2.log("done = true");
				done = true;
			}
		}
	}

	function poseidonHash1(address hasher, bytes32 x) internal view returns (bytes32) {
		return poseidonHash2(hasher, x >> 128, (x << 128) >> 128, 512);
	}
	function poseidonHash2(address hasher, bytes32 v0, bytes32 v1, uint256 domain) internal view returns (bytes32 r) {
		// interface IPoseidon {
		// 	function poseidon(uint256[2], uint256) external view returns (bytes32);
		// }
		// try POSEIDON.poseidon([uint256(v0), uint256(v1)], domain) returns (bytes32 h) {
		// 	return h;
		// } catch {
		// 	revert InvalidProof();
		// }
		bool success;
		assembly {
			let x := mload(0x40)
			// keccak256("poseidon(uint256[2],uint256)")
			mstore(x, 0xa717016c00000000000000000000000000000000000000000000000000000000)
			mstore(add(x, 0x04), v0)
			mstore(add(x, 0x24), v1)
			mstore(add(x, 0x44), domain)
			success := staticcall(gas(), hasher, x, 0x64, 0x20, 0x20)
			r := mload(0x20)
		}
		if (!success) revert InvalidProof();
	}

}
