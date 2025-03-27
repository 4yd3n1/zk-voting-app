// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract VotingContract {
    // Verifier contract interface
    IVerifier public immutable verifier;

    // Vote counts
    uint256 public forVotes;
    uint256 public againstVotes;

    // Mapping to track if an address has voted
    mapping(address => bool) public hasVoted;

    // Events
    event VoteRecorded(address indexed voter, bool indexed vote, uint256 timestamp);

    constructor(address _verifier) {
        verifier = IVerifier(_verifier);
    }

    function recordVote(
        uint256[2] memory _pA,
        uint256[2][2] memory _pB,
        uint256[2] memory _pC,
        uint256[] memory _pubSignals
    ) external {
        require(!hasVoted[msg.sender], "Already voted");
        require(verifier.verifyProof(_pA, _pB, _pC, _pubSignals), "Invalid proof");

        // Extract vote from public signals (assuming it's the first signal)
        uint256 vote = _pubSignals[0];

        // Record the vote
        if (vote == 1) {
            forVotes++;
        } else if (vote == 0) {
            againstVotes++;
        } else {
            revert("Invalid vote value");
        }

        // Mark address as voted
        hasVoted[msg.sender] = true;

        // Emit event
        emit VoteRecorded(msg.sender, vote == 1, block.timestamp);
    }

    function getVoteCounts() external view returns (uint256 forCount, uint256 againstCount) {
        return (forVotes, againstVotes);
    }
}

// Minimal interface for the verifier contract
interface IVerifier {
    function verifyProof(
        uint256[2] memory _pA,
        uint256[2][2] memory _pB,
        uint256[2] memory _pC,
        uint256[] memory _pubSignals
    ) external view returns (bool);
} 