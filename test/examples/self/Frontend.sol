// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../../../contracts/GatewayFetchTarget.sol";
import "../../../contracts/GatewayFetcher.sol";

contract Frontend is GatewayFetchTarget {

	using GatewayFetcher for GatewayRequest;
	
	IGatewayProofVerifier immutable _verifier;
	address immutable _l2Target;
	
	constructor(IGatewayProofVerifier verifier, address l2Target) {
		_verifier = verifier;
		_l2Target = l2Target;
	}

	function get(uint256 key) external view returns (string memory) {
		GatewayRequest memory req = GatewayFetcher.newRequest(1);
		req.setTarget(_l2Target);
		req.setSlot(0).push(key).follow().readBytes().setOutput(0);
		fetch(_verifier, req, this.getCallback.selector, '');
	}

	function getCallback(bytes[] memory values, uint8 /*exitCode*/, bytes memory /*carry*/) external pure returns (string memory) {
		return string(values[0]);
	}

}
