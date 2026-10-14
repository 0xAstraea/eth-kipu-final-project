//SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

// Imported so Hardhat compiles them and they can be deployed with getContractFactory.
import {Semaphore} from "@semaphore-protocol/contracts/Semaphore.sol";
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";

/// @title TeamRegistry
/// @notice Team formation protocol with anonymous applications.
/// @dev Students prove course membership with a Semaphore zero-knowledge proof and apply
/// to teams identified only by their nullifier. Their address is never stored at
/// application time; it is committed as a hash and only revealed (optionally) when they
/// claim their credential NFT. The Semaphore group is administered by this contract so
/// that only the course owner can add members.
contract TeamRegistry is Ownable {
    /// @notice BN254 scalar field size. Semaphore messages must be reduced modulo this
    /// value off-chain to stay consistent with the circuit.
    uint256 public constant SNARK_FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /// @notice Semaphore core contract used to verify membership proofs.
    ISemaphore public immutable semaphore;

    /// @notice Id of the Semaphore group containing the course students.
    uint256 public immutable courseGroupId;

    /// @notice Credential NFT contract, minted when a member claims their credential.
    address public credential;

    /// @notice A team created by a verified student.
    struct Team {
        address admin;
        string name;
        string description;
        uint256 maxMembers;
        uint256 revealAtBlock;
        bool isRevealed;
        uint256[] memberNullifiers;
    }

    /// @notice An application submitted to a team, keyed by nullifier.
    struct Application {
        bytes32 claimCommitment;
        bool accepted;
        bool claimed;
    }

    /// @notice Total number of teams created so far.
    uint256 public teamCounter;

    /// @dev teamId => Team.
    mapping(uint256 => Team) private _teams;

    /// @dev teamId => nullifier => Application.
    mapping(uint256 => mapping(uint256 => Application)) private _applications;

    /// @notice Emitted when a student commitment is added to the course group.
    event CourseMemberAdded(uint256 indexed groupId, uint256 identityCommitment);

    /// @notice Emitted when the credential contract is set.
    event CredentialSet(address indexed credential);

    /// @notice Emitted when a team is created.
    event TeamCreated(uint256 indexed teamId, address indexed admin, string name, uint256 maxMembers);

    /// @notice Emitted when a student applies to a team. Deliberately contains the
    /// nullifier and never the applicant address.
    event JoinRequested(uint256 indexed teamId, uint256 indexed nullifier, string presentation);

    /// @notice Emitted when a team admin accepts an applicant.
    event JoinAccepted(uint256 indexed teamId, uint256 indexed nullifier);

    /// @notice Emitted when an accepted member claims their credential NFT.
    /// @param claimAddress Address chosen by the claimant (may be a throwaway address).
    event CredentialClaimed(uint256 indexed teamId, uint256 indexed nullifier, address indexed claimAddress);

    /// @notice Emitted when a team is revealed (full or deadline reached).
    event TeamRevealed(uint256 indexed teamId, uint256[] memberNullifiers);

    error NotCourseOwner();
    error CredentialNotSet();
    error CredentialAlreadySet();
    error InvalidMaxMembers();
    error InvalidScope();
    error TeamDoesNotExist(uint256 teamId);
    error NotTeamAdmin(uint256 teamId);
    error TeamIsFull(uint256 teamId);
    error TeamAlreadyRevealed(uint256 teamId);
    error RevealConditionsNotMet(uint256 teamId);
    error ApplicationAlreadyExists(uint256 teamId, uint256 nullifier);
    error ApplicationDoesNotExist(uint256 teamId, uint256 nullifier);
    error ApplicationNotAccepted(uint256 teamId, uint256 nullifier);
    error ApplicationAlreadyClaimed(uint256 teamId, uint256 nullifier);
    error InvalidClaimCommitment();
    error InvalidMessageHash();

    /// @param semaphoreAddress Address of the deployed Semaphore contract.
    /// @dev Creates the course group with this contract as its admin, so only the
    /// course owner (through addCourseMember) can add members.
    constructor(address semaphoreAddress) Ownable(msg.sender) {
        semaphore = ISemaphore(semaphoreAddress);
        courseGroupId = semaphore.createGroup(address(this));
    }

    /// @notice Sets the credential NFT contract. Can only be set once.
    /// @param credentialAddress Address of the TeamCredential contract.
    function setCredential(address credentialAddress) external onlyOwner {
        if (credential != address(0)) revert CredentialAlreadySet();
        if (credentialAddress == address(0)) revert CredentialNotSet();

        credential = credentialAddress;
        emit CredentialSet(credentialAddress);
    }

    /// @notice Adds a student identity commitment to the course group.
    /// @dev Only the course owner (e.g. the professor) decides who is a verified student.
    /// @param identityCommitment The student's Semaphore identity commitment.
    function addCourseMember(uint256 identityCommitment) external onlyOwner {
        semaphore.addMember(courseGroupId, identityCommitment);

        emit CourseMemberAdded(courseGroupId, identityCommitment);
    }

    /// @notice Returns the id the next created team will have.
    function nextTeamId() external view returns (uint256) {
        return teamCounter;
    }

    /// @notice Creates a team. The creator must prove course membership with a
    /// zero-knowledge proof scoped to the new team id.
    /// @param name Team name (public).
    /// @param description Team description (public).
    /// @param maxMembers Maximum number of members, including the creator.
    /// @param revealAtBlock Block number after which the team can be revealed even if not
    /// full. Use 0 to allow reveal only when the team is full.
    /// @param proof Semaphore proof of course membership. Its scope must equal the
    /// team id that will be assigned (see nextTeamId).
    /// @return teamId Id of the created team.
    function createTeam(
        string calldata name,
        string calldata description,
        uint256 maxMembers,
        uint256 revealAtBlock,
        ISemaphore.SemaphoreProof calldata proof
    ) external returns (uint256 teamId) {
        if (maxMembers == 0) revert InvalidMaxMembers();

        teamId = teamCounter;

        // The proof must be scoped to the team being created.
        if (proof.scope != teamId) revert InvalidScope();

        semaphore.validateProof(courseGroupId, proof);

        Team storage team = _teams[teamId];
        team.admin = msg.sender;
        team.name = name;
        team.description = description;
        team.maxMembers = maxMembers;
        team.revealAtBlock = revealAtBlock;
        team.isRevealed = false;
        team.memberNullifiers.push(proof.nullifier);

        teamCounter = teamId + 1;

        emit TeamCreated(teamId, msg.sender, name, maxMembers);
    }

    /// @notice Applies to a team. The application is anonymous: only the nullifier is
    /// stored, never the sender address.
    /// @param teamId Id of the team.
    /// @param presentation Free-text message (e.g. skills or motivation). Its hash is
    /// authenticated inside the proof.
    /// @param claimCommitment keccak256(abi.encode(claimAddress, salt)) where claimAddress
    /// is the address that will receive the credential NFT and salt is a random secret.
    /// @param proof Semaphore proof of course membership. Its scope must equal teamId and
    /// its message must equal keccak256(presentation, claimCommitment) reduced to the
    /// SNARK field.
    function requestJoin(
        uint256 teamId,
        string calldata presentation,
        bytes32 claimCommitment,
        ISemaphore.SemaphoreProof calldata proof
    ) external {
        Team storage team = _teams[teamId];

        if (team.maxMembers == 0) revert TeamDoesNotExist(teamId);
        if (team.isRevealed) revert TeamAlreadyRevealed(teamId);
        if (team.memberNullifiers.length >= team.maxMembers) revert TeamIsFull(teamId);

        Application storage application = _applications[teamId][proof.nullifier];

        if (application.claimCommitment != bytes32(0)) revert ApplicationAlreadyExists(teamId, proof.nullifier);

        // The proof authenticates both the presentation text and the claim commitment.
        uint256 expectedMessage =
            uint256(keccak256(abi.encodePacked(presentation, claimCommitment))) % SNARK_FIELD_SIZE;

        if (proof.message != expectedMessage) revert InvalidMessageHash();

        semaphore.validateProof(courseGroupId, proof);

        // Effects: store the application keyed by the nullifier only. msg.sender is
        // deliberately not stored anywhere.
        application.claimCommitment = claimCommitment;
        application.accepted = false;
        application.claimed = false;

        emit JoinRequested(teamId, proof.nullifier, presentation);
    }

    /// @notice Accepts an applicant identified by their nullifier.
    /// @dev Only callable by the team admin.
    function acceptRequest(uint256 teamId, uint256 nullifier) external {
        Team storage team = _teams[teamId];

        if (team.maxMembers == 0) revert TeamDoesNotExist(teamId);
        if (msg.sender != team.admin) revert NotTeamAdmin(teamId);
        if (team.isRevealed) revert TeamAlreadyRevealed(teamId);
        if (team.memberNullifiers.length >= team.maxMembers) revert TeamIsFull(teamId);

        Application storage application = _applications[teamId][nullifier];

        if (application.claimCommitment == bytes32(0)) revert ApplicationDoesNotExist(teamId, nullifier);
        if (application.accepted) revert ApplicationAlreadyExists(teamId, nullifier);

        application.accepted = true;
        team.memberNullifiers.push(nullifier);

        emit JoinAccepted(teamId, nullifier);
    }

    /// @notice Claims the credential NFT for an accepted application.
    /// @dev Anyone may submit the transaction (gas can be paid by a third party); the
    /// NFT always goes to the claimAddress fixed in the commitment. The claimAddress
    /// can be a throwaway address to keep the claimant's main address private.
    function claimCredential(uint256 teamId, uint256 nullifier, address claimAddress, uint256 salt) external {
        if (credential == address(0)) revert CredentialNotSet();

        Application storage application = _applications[teamId][nullifier];

        if (application.claimCommitment == bytes32(0)) revert ApplicationDoesNotExist(teamId, nullifier);
        if (!application.accepted) revert ApplicationNotAccepted(teamId, nullifier);
        if (application.claimed) revert ApplicationAlreadyClaimed(teamId, nullifier);

        bytes32 commitment = keccak256(abi.encode(claimAddress, salt));

        if (commitment != application.claimCommitment) revert InvalidClaimCommitment();

        // Effects before the external mint call (Checks-Effects-Interactions).
        application.claimed = true;

        _mintCredential(claimAddress, teamId);

        emit CredentialClaimed(teamId, nullifier, claimAddress);
    }

    /// @notice Reveals the final team composition. Requires the team to be full or the
    /// reveal deadline to have passed.
    /// @dev Reveals nullifiers only; member addresses are never exposed by the contract.
    function reveal(uint256 teamId) external {
        Team storage team = _teams[teamId];

        if (team.maxMembers == 0) revert TeamDoesNotExist(teamId);
        if (team.isRevealed) revert TeamAlreadyRevealed(teamId);

        bool isFull = team.memberNullifiers.length == team.maxMembers;
        bool deadlinePassed = team.revealAtBlock != 0 && block.number >= team.revealAtBlock;

        if (!isFull && !deadlinePassed) revert RevealConditionsNotMet(teamId);

        team.isRevealed = true;

        emit TeamRevealed(teamId, team.memberNullifiers);
    }

    function _mintCredential(address to, uint256 teamId) private {
        (bool success, bytes memory returnData) =
            credential.call(abi.encodeWithSignature("mint(address,uint256)", to, teamId));

        if (!success) {
            if (returnData.length > 0) {
                assembly {
                    revert(add(returnData, 0x20), mload(returnData))
                }
            }
            revert CredentialNotSet();
        }
    }

    /// @notice Returns the full team data.
    function getTeam(uint256 teamId)
        external
        view
        returns (
            address admin,
            string memory name,
            string memory description,
            uint256 maxMembers,
            uint256 revealAtBlock,
            bool isRevealed,
            uint256 membersCount
        )
    {
        Team storage team = _teams[teamId];

        return (
            team.admin,
            team.name,
            team.description,
            team.maxMembers,
            team.revealAtBlock,
            team.isRevealed,
            team.memberNullifiers.length
        );
    }

    /// @notice Returns the nullifiers of the team members.
    function getTeamMembers(uint256 teamId) external view returns (uint256[] memory) {
        return _teams[teamId].memberNullifiers;
    }

    /// @notice Returns an application by team and nullifier.
    function getApplication(uint256 teamId, uint256 nullifier)
        external
        view
        returns (bytes32 claimCommitment, bool accepted, bool claimed)
    {
        Application storage application = _applications[teamId][nullifier];

        return (application.claimCommitment, application.accepted, application.claimed);
    }
}
