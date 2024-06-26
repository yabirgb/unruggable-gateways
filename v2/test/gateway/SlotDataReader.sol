// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../../contracts/EVMFetchTarget.sol";
import "../../contracts/EVMFetcher.sol";

contract SlotDataReader is EVMFetchTarget {
	using EVMFetcher for EVMRequest;
	IEVMVerifier immutable _verifier;
	address immutable _target;
	constructor(IEVMVerifier verifier, address target) {
		_verifier = verifier;
		_target = target;
	}
	function debugCallback(bytes[] memory m, uint8 exitCode, bytes memory) external pure returns (bytes[] memory, uint8) {
		return (m, exitCode);
	}

	function readLatest() external view returns (uint256) {
		EVMRequest memory r = EVMFetcher.newRequest(1).setTarget(_target);
		r.read().setOutput(0);
		fetch(_verifier, r, this.readLatestCallback.selector, '');
	}
	function readLatestCallback(bytes[] memory m, uint8, bytes memory) external pure returns (uint256) {
		return abi.decode(m[0], (uint256));
	}

	function readName() external view returns (string memory) {
		EVMRequest memory r = EVMFetcher.newRequest(1).setTarget(_target);
		r.setSlot(1).readBytes().setOutput(0);
		fetch(_verifier, r, this.readNameCallback.selector, '');
	}
	function readNameCallback(bytes[] memory m, uint8, bytes memory) external pure returns (string memory) {
		return string(m[0]);
	}

	function readHighscore(uint256 key) external view returns (uint256) {
		EVMRequest memory r = EVMFetcher.newRequest(1).setTarget(_target);
		r.setSlot(2).push(key).follow().read().setOutput(0);
		fetch(_verifier, r, this.readHighscoreCallback.selector, '');
	}
	function readHighscoreCallback(bytes[] memory m, uint8, bytes memory) external pure returns (uint256) {
		return abi.decode(m[0], (uint256));
	}

	function readLatestHighscore() external view returns (uint256) {
		EVMRequest memory r = EVMFetcher.newRequest(1).setTarget(_target);
		r.read().setSlot(2).follow().read().setOutput(0);
		fetch(_verifier, r, this.readLatestHighscoreCallback.selector, '');
	}
	function readLatestHighscoreCallback(bytes[] memory m, uint8, bytes memory) external pure returns (uint256) {
		return abi.decode(m[0], (uint256));
	}

	function readLatestHighscorer() external view returns (string memory) {
		EVMRequest memory r = EVMFetcher.newRequest(1).setTarget(_target);
		r.read().setSlot(3).follow().readBytes().setOutput(0);
		fetch(_verifier, r, this.readLatestHighscorerCallback.selector, '');
	}
	function readLatestHighscorerCallback(bytes[] memory m, uint8, bytes memory) external pure returns (string memory) {
		return string(m[0]);
	}

	function readRealName(string memory key) external view returns (string memory) {
		EVMRequest memory r = EVMFetcher.newRequest(1).setTarget(_target);
		r.setSlot(4).push(key).follow().readBytes().setOutput(0);
		fetch(_verifier, r, this.readRealNameCallback.selector, '');
	}
	function readRealNameCallback(bytes[] memory m, uint8, bytes memory) external pure returns (string memory) {
		return string(m[0]);
	}

	function readLatestHighscorerRealName() external view returns (string memory) {
		EVMRequest memory r = EVMFetcher.newRequest(1).setTarget(_target);
		r.read().setSlot(3).follow().readBytes().setSlot(4).follow().readBytes().setOutput(0);
		fetch(_verifier, r, this.readLatestHighscorerRealNameCallback.selector, '');
	}
	function readLatestHighscorerRealNameCallback(bytes[] memory m, uint8, bytes memory) external pure returns (string memory) {
		return string(m[0]);
	}

}
