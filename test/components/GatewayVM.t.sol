// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {GatewayVM} from '../../contracts/GatewayVM.sol';
import 'forge-std/Test.sol';

contract TestGatewayVM is Test {

    function test_isZeros() external pure {
        for (uint256 i = 0; i < 65; i++) {
            bytes memory v = new bytes(i);
            assertEq(GatewayVM.isZeros(v), true);
            if (i > 0) {
                v[i - 1] = hex'01';
                assertEq(GatewayVM.isZeros(v), false);
            }
        }
    }

    function test_isZeros_withCruft() external pure {
        bytes memory v = new bytes(63);
        assembly {
            mstore8(add(v, 95), 1) // v[63] = 1 (beyond bounds)
        }
        assertEq(GatewayVM.isZeros(v), true);
    }

    function test_smallKeccak() external pure {
		for (uint256 i = 0; i < 100; i++) {
	        assertEq(
    	        GatewayVM.smallKeccak(bytes32(i)),
        	    keccak256(abi.encode(bytes32(i)))
        	);
		}
    }

}
