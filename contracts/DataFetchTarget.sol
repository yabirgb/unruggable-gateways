//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {DataRequest} from "./ProtocolData.sol";
import {IDataProofVerifier} from "./IDataProofVerifier.sol";
import {IDataProver} from "./IDataProver.sol";
import "forge-std/console2.sol"; // DEBUG
import {VerifierProxy} from "./VerifierProxy.sol";

error OffchainLookup(address from, string[] urls, bytes request, bytes4 callback, bytes carry);

abstract contract DataFetchTarget {

	struct Session {
		IDataProofVerifier verifier;
		bytes context;
		DataRequest req;
		bytes4 callback;
		bytes carry;
	}

	function fetch(IDataProofVerifier verifier, DataRequest memory req, bytes4 callback, bytes memory carry) internal {

						console2.log("FETCH");
						console2.logBytes(abi.encode(address(verifier)));

		// Function signature for `gatewayURLs()`
        bytes memory encodedData = abi.encodeWithSignature("gatewayURLs()");

        // Low-level call to the proxy
        (bool success, bytes memory returnData) = address(verifier).call(encodedData);
        
        require(success, "Call to proxy failed");
/*
		revert OffchainLookup(
			address(this),
			verifier.gatewayURLs(),
			abi.encodeCall(IDataProver.proveRequest, (context, req)),
			this.fetchCallback.selector,
			abi.encode(Session(verifier, context, req, callback, carry))
		);
		*/
	}

	function fetchCallback(bytes calldata response, bytes calldata carry) external view {

		console2.log("CALLBACK");
		Session memory ses = abi.decode(carry, (Session));
		(bytes[] memory values, uint8 exitCode) = ses.verifier.getStorageValues(ses.context, ses.req, response);
		(bool ok, bytes memory ret) = address(this).staticcall(abi.encodeWithSelector(ses.callback, values, exitCode, ses.carry));
		if (ok) {
			assembly { return(add(ret, 32), mload(ret)) }
		} else {
			assembly { revert(add(ret, 32), mload(ret)) }
		}
	}

}
