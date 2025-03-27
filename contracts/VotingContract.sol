// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IVerifier {
    function verifyProof(
        uint256[2] memory _pA,
        uint256[2][2] memory _pB,
        uint256[2] memory _pC,
        uint256[] memory _pubSignals
    ) external view returns (bool);
}

contract VotingContract {
    // Verifier contract interface
    IVerifier public immutable verifier;

    struct Proposal {
        string title;
        string description;
        uint256 forVotes;
        uint256 againstVotes;
        mapping(address => bool) hasVoted;
        bool exists;
    }

    mapping(uint256 => Proposal) public proposals;
    uint256 public proposalCount;

    // Events
    event ProposalCreated(uint256 indexed proposalId, string title, string description);
    event VoteRecorded(uint256 indexed proposalId, address indexed voter);

    constructor(address _verifier) {
        verifier = IVerifier(_verifier);
    }

    function createProposal(string memory _title, string memory _description) public returns (uint256) {
        require(bytes(_title).length > 0, "Title cannot be empty");
        require(bytes(_description).length > 0, "Description cannot be empty");
        
        uint256 proposalId = proposalCount;
        Proposal storage newProposal = proposals[proposalId];
        newProposal.title = _title;
        newProposal.description = _description;
        newProposal.forVotes = 0;
        newProposal.againstVotes = 0;
        newProposal.exists = true;

        emit ProposalCreated(proposalId, _title, _description);
        proposalCount++;
        return proposalId;
    }

    function recordVote(
        uint256[2] memory _pA,
        uint256[2][2] memory _pB,
        uint256[2] memory _pC,
        uint256[] memory _pubSignals
    ) public {
        require(!hasVoted(msg.sender), "Already voted");

        // Verify the zero-knowledge proof
        bool isValid = verifyProof(_pA, _pB, _pC, _pubSignals);
        require(isValid, "Invalid proof");

        // Record the vote based on the public signal
        if (_pubSignals[0] == 1) {
            proposals[0].forVotes++;
        } else {
            proposals[0].againstVotes++;
        }

        proposals[0].hasVoted[msg.sender] = true;
        emit VoteRecorded(0, msg.sender);
    }

    function getVoteCounts() public view returns (uint256 forCount, uint256 againstCount) {
        return (proposals[0].forVotes, proposals[0].againstVotes);
    }

    function hasVoted(address voter) public view returns (bool) {
        return proposals[0].hasVoted[voter];
    }

    function verifyProof(
        uint256[2] memory _pA,
        uint256[2][2] memory _pB,
        uint256[2] memory _pC,
        uint256[] memory _pubSignals
    ) internal view returns (bool) {
        return verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
    }
} 