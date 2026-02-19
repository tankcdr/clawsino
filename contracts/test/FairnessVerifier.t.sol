// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {FairnessVerifier} from "../src/FairnessVerifier.sol";

contract FairnessVerifierTest is Test {
    FairnessVerifier public verifier;

    event CommitVerified(bytes32 indexed commit, bytes32 serverSeed, uint256 nonce, bool valid);
    event GameResultVerified(address indexed verifier, bytes32 indexed commit, bytes32 serverSeed, uint256 nonce);

    bytes32 serverSeed = keccak256("test-server-seed");
    uint256 nonce = 42;
    bytes32 validCommit;

    function setUp() public {
        verifier = new FairnessVerifier();
        validCommit = keccak256(abi.encodePacked(serverSeed, nonce));
    }

    function test_computeCommit() public view {
        bytes32 computed = verifier.computeCommit(serverSeed, nonce);
        assertEq(computed, validCommit);
    }

    function test_checkCommitReveal_valid() public view {
        assertTrue(verifier.checkCommitReveal(validCommit, serverSeed, nonce));
    }

    function test_checkCommitReveal_invalid() public view {
        assertFalse(verifier.checkCommitReveal(bytes32(uint256(1)), serverSeed, nonce));
    }

    function test_checkCommitReveal_wrongSeed() public view {
        assertFalse(verifier.checkCommitReveal(validCommit, keccak256("wrong"), nonce));
    }

    function test_checkCommitReveal_wrongNonce() public view {
        assertFalse(verifier.checkCommitReveal(validCommit, serverSeed, 999));
    }

    function test_verifyCommitReveal_valid() public {
        vm.expectEmit(true, false, false, true);
        emit CommitVerified(validCommit, serverSeed, nonce, true);
        bool valid = verifier.verifyCommitReveal(validCommit, serverSeed, nonce);
        assertTrue(valid);
    }

    function test_verifyCommitReveal_invalid() public {
        bool valid = verifier.verifyCommitReveal(bytes32(uint256(1)), serverSeed, nonce);
        assertFalse(valid);
    }

    function test_submitVerification_valid() public {
        vm.expectEmit(true, true, false, true);
        emit GameResultVerified(address(this), validCommit, serverSeed, nonce);
        bool valid = verifier.submitVerification(validCommit, serverSeed, nonce);
        assertTrue(valid);
    }

    function test_submitVerification_invalid() public {
        bool valid = verifier.submitVerification(bytes32(uint256(1)), serverSeed, nonce);
        assertFalse(valid);
    }

    // Fuzz test
    function testFuzz_commitReveal(bytes32 seed, uint256 n) public view {
        bytes32 commit = keccak256(abi.encodePacked(seed, n));
        assertTrue(verifier.checkCommitReveal(commit, seed, n));
    }
}
