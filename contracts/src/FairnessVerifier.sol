// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FairnessVerifier — On-chain commit-reveal verification for Clawsino
/// @notice Agents can independently verify that game results match committed seeds.
contract FairnessVerifier {
    event CommitVerified(bytes32 indexed commit, bytes32 serverSeed, uint256 nonce, bool valid);
    event GameResultVerified(
        address indexed verifier,
        bytes32 indexed commit,
        bytes32 serverSeed,
        uint256 nonce
    );

    /// @notice Verify that commit == keccak256(abi.encodePacked(serverSeed, nonce))
    function verifyCommitReveal(
        bytes32 commit,
        bytes32 serverSeed,
        uint256 nonce
    ) external returns (bool valid) {
        valid = commit == keccak256(abi.encodePacked(serverSeed, nonce));
        emit CommitVerified(commit, serverSeed, nonce, valid);
    }

    /// @notice Pure version for off-chain/view calls
    function checkCommitReveal(
        bytes32 commit,
        bytes32 serverSeed,
        uint256 nonce
    ) external pure returns (bool) {
        return commit == keccak256(abi.encodePacked(serverSeed, nonce));
    }

    /// @notice Compute what the commit should be for given seed + nonce
    function computeCommit(bytes32 serverSeed, uint256 nonce) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(serverSeed, nonce));
    }

    /// @notice Submit and verify a full game result on-chain (for public record)
    function submitVerification(
        bytes32 commit,
        bytes32 serverSeed,
        uint256 nonce
    ) external returns (bool valid) {
        valid = commit == keccak256(abi.encodePacked(serverSeed, nonce));
        if (valid) {
            emit GameResultVerified(msg.sender, commit, serverSeed, nonce);
        }
        emit CommitVerified(commit, serverSeed, nonce, valid);
    }
}
