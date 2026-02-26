// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract UrbanLeafCommunity {

    event ProposalCreated(
        uint64 indexed proposalId,
        string parkName,
        string parkId,
        uint256 endDate,
        string creatorAccountId
    );

    event VoteCast(
        uint64 indexed proposalId,
        address indexed voter,
        bool vote
    );

    event ProposalStatusUpdated(
        uint64 indexed proposalId,
        ProposalStatus newStatus
    );

    event ContractInitialized(address indexed deployer);

    event DonationReceived(
        uint64 indexed proposalId,
        address indexed donor,
        uint256 amount,
        uint256 timestamp
    );

    event FundingGoalSet(
        uint64 indexed proposalId,
        uint256 goal
    );

    event FundsWithdrawn(
        uint64 indexed proposalId,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );

    enum ProposalStatus {
        Active,
        Accepted,
        Declined
    }

    struct EnvironmentalData {
        uint256 ndviBefore;
        uint256 ndviAfter;
        uint256 pm25Before;
        uint256 pm25After;
        uint256 pm25IncreasePercent;
        uint256 vegetationLossPercent;
    }

    struct Demographics {
        uint64 children;
        uint64 adults;
        uint64 seniors;
        uint64 totalAffectedPopulation;
    }

    struct Donation {
        address donor;
        uint256 amount;
        uint256 timestamp;
    }

    struct Proposal {
        uint64 id;
        string parkName;
        string parkId;
        string description;
        uint256 endDate;
        ProposalStatus status;
        uint64 yesVotes;
        uint64 noVotes;
        EnvironmentalData environmentalData;
        Demographics demographics;
        string creatorAccountId;
        uint256 fundingGoal;
        uint256 totalFundsRaised;
        bool fundingEnabled;
    }

    mapping(uint64 => Proposal) public proposals;
    mapping(uint64 => mapping(address => bool)) public userVotes;
    mapping(uint64 => mapping(address => bool)) public hasVoted;
    mapping(uint64 => Donation[]) public proposalDonations;
    mapping(uint64 => mapping(address => uint256)) public userDonationTotal;
    uint64 public proposalCounter;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier proposalExists(uint64 proposalId) {
        require(proposals[proposalId].id != 0, "Proposal does not exist");
        _;
    }

    modifier proposalActive(uint64 proposalId) {
        require(proposals[proposalId].status == ProposalStatus.Active, "Proposal is not active");
        _;
    }

    modifier hasNotVoted(uint64 proposalId, address voter) {
        require(!hasVoted[proposalId][voter], "User has already voted");
        _;
    }

    modifier votingPeriodActive(uint64 proposalId) {
        require(block.timestamp <= proposals[proposalId].endDate, "Voting period has ended");
        _;
    }

    constructor() {
        owner = msg.sender;
        proposalCounter = 0;
        emit ContractInitialized(msg.sender);
    }

    function createProposal(
        string memory parkName,
        string memory parkId,
        string memory description,
        uint256 endDate,
        EnvironmentalData memory environmentalData,
        Demographics memory demographics,
        string memory creatorAccountId,
        bool fundraisingEnabled,
        uint256 fundingGoal
    ) public returns (uint64) {
        require(bytes(parkName).length > 0, "Park name cannot be empty");
        require(bytes(parkId).length > 0, "Park ID cannot be empty");
        require(bytes(creatorAccountId).length > 0, "Creator account ID cannot be empty");
        require(endDate > block.timestamp, "End date must be in the future");

        proposalCounter++;
        uint64 proposalId = proposalCounter;

        Proposal storage proposal = proposals[proposalId];
        proposal.id = proposalId;
        proposal.parkName = parkName;
        proposal.parkId = parkId;
        proposal.description = description;
        proposal.endDate = endDate;
        proposal.status = ProposalStatus.Active;
        proposal.yesVotes = 0;
        proposal.noVotes = 0;
        proposal.environmentalData = environmentalData;
        proposal.demographics = demographics;
        proposal.creatorAccountId = creatorAccountId;
        proposal.fundingGoal = fundingGoal;
        proposal.totalFundsRaised = 0;
        proposal.fundingEnabled = false;

        emit ProposalCreated(
            proposalId,
            parkName,
            parkId,
            endDate,
            creatorAccountId
        );

        return proposalId;
    }

    function vote(
        uint64 proposalId,
        bool voteValue,
        address voter
    )
        public
        proposalExists(proposalId)
        proposalActive(proposalId)
        hasNotVoted(proposalId, voter)
        votingPeriodActive(proposalId)
    {
        userVotes[proposalId][voter] = voteValue;
        hasVoted[proposalId][voter] = true;

        if (voteValue) {
            proposals[proposalId].yesVotes++;
        } else {
            proposals[proposalId].noVotes++;
        }

        emit VoteCast(proposalId, voter, voteValue);
    }

    function updateProposalStatus(uint64 proposalId)
        public
        onlyOwner
        proposalExists(proposalId)
        proposalActive(proposalId)
    {
        require(block.timestamp > proposals[proposalId].endDate, "Voting period has not ended");

        ProposalStatus newStatus = ProposalStatus.Declined;
        if (proposals[proposalId].yesVotes > proposals[proposalId].noVotes) {
            newStatus = ProposalStatus.Accepted;

            if (proposals[proposalId].fundingGoal > 0) {
                proposals[proposalId].fundingEnabled = true;
            }
        }

        proposals[proposalId].status = newStatus;

        emit ProposalStatusUpdated(proposalId, newStatus);
    }

    function forceCloseProposal(uint64 proposalId, ProposalStatus newStatus)
        public
        onlyOwner
        proposalExists(proposalId)
        proposalActive(proposalId)
    {
        proposals[proposalId].status = newStatus;

        if (newStatus == ProposalStatus.Accepted && proposals[proposalId].fundingGoal > 0) {
            proposals[proposalId].fundingEnabled = true;
        }

        emit ProposalStatusUpdated(proposalId, newStatus);
    }

    function getProposal(uint64 proposalId)
        public
        view
        proposalExists(proposalId)
        returns (Proposal memory)
    {
        return proposals[proposalId];
    }

    function getVoteCounts(uint64 proposalId)
        public
        view
        proposalExists(proposalId)
        returns (uint64 yesVotes, uint64 noVotes)
    {
        return (proposals[proposalId].yesVotes, proposals[proposalId].noVotes);
    }

    function getUserVote(uint64 proposalId, address user)
        public
        view
        proposalExists(proposalId)
        returns (bool voteValue, bool voted)
    {
        return (userVotes[proposalId][user], hasVoted[proposalId][user]);
    }

    function hasUserVoted(uint64 proposalId, address user)
        public
        view
        proposalExists(proposalId)
        returns (bool)
    {
        return hasVoted[proposalId][user];
    }

    function isProposalActive(uint64 proposalId)
        public
        view
        proposalExists(proposalId)
        returns (bool)
    {
        return proposals[proposalId].status == ProposalStatus.Active &&
               block.timestamp <= proposals[proposalId].endDate;
    }

    function getAllActiveProposals() public view returns (uint64[] memory) {
        uint64 activeCount = 0;

        for (uint64 i = 1; i <= proposalCounter; i++) {
            if (proposals[i].status == ProposalStatus.Active) {
                activeCount++;
            }
        }

        uint64[] memory activeProposals = new uint64[](activeCount);
        uint64 index = 0;

        for (uint64 i = 1; i <= proposalCounter; i++) {
            if (proposals[i].status == ProposalStatus.Active) {
                activeProposals[index] = i;
                index++;
            }
        }

        return activeProposals;
    }

    function getAllAcceptedProposals() public view returns (uint64[] memory) {
        uint64 acceptedCount = 0;

        for (uint64 i = 1; i <= proposalCounter; i++) {
            if (proposals[i].status == ProposalStatus.Accepted) {
                acceptedCount++;
            }
        }

        uint64[] memory acceptedProposals = new uint64[](acceptedCount);
        uint64 index = 0;

        for (uint64 i = 1; i <= proposalCounter; i++) {
            if (proposals[i].status == ProposalStatus.Accepted) {
                acceptedProposals[index] = i;
                index++;
            }
        }

        return acceptedProposals;
    }

    function getAllRejectedProposals() public view returns (uint64[] memory) {
        uint64 rejectedCount = 0;

        for (uint64 i = 1; i <= proposalCounter; i++) {
            if (proposals[i].status == ProposalStatus.Declined) {
                rejectedCount++;
            }
        }

        uint64[] memory rejectedProposals = new uint64[](rejectedCount);
        uint64 index = 0;

        for (uint64 i = 1; i <= proposalCounter; i++) {
            if (proposals[i].status == ProposalStatus.Declined) {
                rejectedProposals[index] = i;
                index++;
            }
        }

        return rejectedProposals;
    }

    function getAllClosedProposals() public view returns (uint64[] memory) {
        uint64 closedCount = 0;

        for (uint64 i = 1; i <= proposalCounter; i++) {
            if (proposals[i].status == ProposalStatus.Accepted ||
                proposals[i].status == ProposalStatus.Declined) {
                closedCount++;
            }
        }

        uint64[] memory closedProposals = new uint64[](closedCount);
        uint64 index = 0;

        for (uint64 i = 1; i <= proposalCounter; i++) {
            if (proposals[i].status == ProposalStatus.Accepted ||
                proposals[i].status == ProposalStatus.Declined) {
                closedProposals[index] = i;
                index++;
            }
        }

        return closedProposals;
    }

    function getTotalProposals() public view returns (uint64) {
        return proposalCounter;
    }

    function setFundingGoal(uint64 proposalId, uint256 goal)
        public
        onlyOwner
        proposalExists(proposalId)
    {
        require(proposals[proposalId].status == ProposalStatus.Accepted, "Proposal must be accepted");
        proposals[proposalId].fundingGoal = goal;
        emit FundingGoalSet(proposalId, goal);
    }

    function donateToProposal(uint64 proposalId)
        public
        payable
        proposalExists(proposalId)
    {
        require(proposals[proposalId].status == ProposalStatus.Accepted, "Proposal not accepted");
        require(proposals[proposalId].fundingEnabled, "Funding not enabled");
        require(msg.value > 0, "Must send HBAR");

        proposalDonations[proposalId].push(Donation({
            donor: msg.sender,
            amount: msg.value,
            timestamp: block.timestamp
        }));

        userDonationTotal[proposalId][msg.sender] += msg.value;
        proposals[proposalId].totalFundsRaised += msg.value;

        emit DonationReceived(proposalId, msg.sender, msg.value, block.timestamp);
    }

    function withdrawFunds(uint64 proposalId, address payable recipient)
        public
        onlyOwner
        proposalExists(proposalId)
    {
        require(proposals[proposalId].totalFundsRaised > 0, "No funds to withdraw");

        uint256 amount = proposals[proposalId].totalFundsRaised;
        proposals[proposalId].totalFundsRaised = 0;

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer failed");

        emit FundsWithdrawn(proposalId, recipient, amount, block.timestamp);
    }

    function getDonationProgress(uint64 proposalId)
        public
        view
        proposalExists(proposalId)
        returns (uint256 raised, uint256 goal, uint256 percentage)
    {
        raised = proposals[proposalId].totalFundsRaised;
        goal = proposals[proposalId].fundingGoal;
        percentage = goal > 0 ? (raised * 100) / goal : 0;
    }

    function getProposalDonations(uint64 proposalId)
        public
        view
        proposalExists(proposalId)
        returns (Donation[] memory)
    {
        return proposalDonations[proposalId];
    }

    function getUserDonationTotal(uint64 proposalId, address user)
        public
        view
        proposalExists(proposalId)
        returns (uint256)
    {
        return userDonationTotal[proposalId][user];
    }

    receive() external payable {}
}
