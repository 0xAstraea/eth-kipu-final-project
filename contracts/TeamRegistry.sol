//SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {ITeamCredential} from "./interfaces/ITeamCredential.sol";

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
contract TeamRegistry is Ownable, ReentrancyGuardTransient {
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
    /// @dev admin, maxMembers and revealAtBlock share one storage slot on purpose:
    /// 20 + 4 + 8 bytes. A fresh storage slot costs 22,100 gas, so packing three fields
    /// into one slot removes two slots per team.
    struct Team {
        address admin;
        uint32 maxMembers;
        uint64 revealAtBlock;
        string name;
        string description;
        /// @dev commitment over the sorted member nullifiers, set at reveal time. It also
        /// carries the revealed state: a team is revealed exactly when its root is set.
        bytes32 rosterRoot;
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
    /// @param groupId Id of the Semaphore group that holds the course members.
    /// @param identityCommitment The student's Semaphore identity commitment.
    event CourseMemberAdded(uint256 indexed groupId, uint256 identityCommitment);

    /// @notice Emitted when the credential contract is set.
    /// @param credential Address of the TeamCredential contract allowed to mint.
    event CredentialSet(address indexed credential);

    /// @notice Emitted when a team is created.
    /// @param teamId Id of the new team.
    /// @param admin Address of the team administrator, the creator.
    /// @param name Public name of the team.
    /// @param maxMembers Maximum number of members, including the creator.
    event TeamCreated(uint256 indexed teamId, address indexed admin, string name, uint256 maxMembers);

    /// @notice Emitted when a student applies to a team. Deliberately contains the
    /// nullifier and never the applicant address.
    /// @param teamId Id of the team the student applied to.
    /// @param nullifier Pseudonym of the applicant.
    /// @param presentation Free-text message the applicant sent with the application.
    event JoinRequested(uint256 indexed teamId, uint256 indexed nullifier, string presentation);

    /// @notice Emitted when a team admin accepts an applicant.
    /// @param teamId Id of the team that accepted the applicant.
    /// @param nullifier Pseudonym of the accepted applicant.
    event JoinAccepted(uint256 indexed teamId, uint256 indexed nullifier);

    /// @notice Emitted when an accepted member claims their credential NFT.
    /// @param teamId Id of the team the credential certifies.
    /// @param nullifier Pseudonym of the claimant.
    /// @param claimAddress Address chosen by the claimant (may be a throwaway address).
    event CredentialClaimed(uint256 indexed teamId, uint256 indexed nullifier, address indexed claimAddress);

    /// @notice Emitted when a team is revealed (full or deadline reached).
    /// @param teamId Id of the revealed team.
    /// @param memberNullifiers The member pseudonyms, sorted ascending.
    event TeamRevealed(uint256 indexed teamId, uint256[] memberNullifiers);

    /// @notice Thrown when a caller other than the course owner performs an owner-only action.
    error NotCourseOwner();
    /// @notice Thrown when the credential contract address is zero.
    error CredentialNotSet();
    /// @notice Thrown when the credential contract was already set.
    error CredentialAlreadySet();
    /// @notice Thrown when a team is created with a maximum member count of zero or one
    /// that does not fit the packed field.
    error InvalidMaxMembers();
    /// @notice Thrown when a team is created with a reveal block that does not fit the
    /// packed field.
    error InvalidRevealAtBlock();
    /// @notice Thrown when the proof scope does not match the team id being created.
    error InvalidScope();
    /// @notice Thrown when operating on a team that does not exist.
    /// @param teamId Id of the missing team.
    error TeamDoesNotExist(uint256 teamId);
    /// @notice Thrown when a caller other than the team admin performs an admin-only action.
    /// @param teamId Id of the team the caller is not admin of.
    error NotTeamAdmin(uint256 teamId);
    /// @notice Thrown when an action would exceed the team's maximum member count.
    /// @param teamId Id of the full team.
    error TeamIsFull(uint256 teamId);
    /// @notice Thrown when operating on a team that was already revealed.
    /// @param teamId Id of the revealed team.
    error TeamAlreadyRevealed(uint256 teamId);
    /// @notice Thrown when a team is revealed before it is full and before the deadline block.
    /// @param teamId Id of the team whose reveal conditions are not met.
    error RevealConditionsNotMet(uint256 teamId);
    /// @notice Thrown when claiming a credential for a team that has not been revealed yet.
    /// @param teamId Id of the team that is not revealed yet.
    error TeamNotRevealed(uint256 teamId);
    /// @notice Thrown when an application already exists for the given nullifier.
    /// @param teamId Id of the team.
    /// @param nullifier Applicant nullifier that already applied.
    error ApplicationAlreadyExists(uint256 teamId, uint256 nullifier);
    /// @notice Thrown when no application exists for the given nullifier.
    /// @param teamId Id of the team.
    /// @param nullifier Applicant nullifier with no application.
    error ApplicationDoesNotExist(uint256 teamId, uint256 nullifier);
    /// @notice Thrown when claiming or reading an application that was not accepted.
    /// @param teamId Id of the team.
    /// @param nullifier Applicant nullifier that was not accepted.
    error ApplicationNotAccepted(uint256 teamId, uint256 nullifier);
    /// @notice Thrown when claiming a credential that was already claimed.
    /// @param teamId Id of the team.
    /// @param nullifier Applicant nullifier that already claimed.
    error ApplicationAlreadyClaimed(uint256 teamId, uint256 nullifier);
    /// @notice Thrown when the supplied address and salt do not match the stored commitment.
    error InvalidClaimCommitment();
    /// @notice Thrown when the proof message does not match keccak256(presentation, claimCommitment).
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
    function addCourseMember(uint256 identityCommitment) external onlyOwner nonReentrant {
        semaphore.addMember(courseGroupId, identityCommitment);

        emit CourseMemberAdded(courseGroupId, identityCommitment);
    }

    /// @notice Adds several students to the course group in one transaction.
    /// @dev Cheaper per student than one call per student: the tree insert, the event and
    /// the base transaction cost are paid once.
    /// @param identityCommitments The students' Semaphore identity commitments.
    function addCourseMembers(uint256[] calldata identityCommitments) external onlyOwner nonReentrant {
        semaphore.addMembers(courseGroupId, identityCommitments);

        for (uint256 i = 0; i < identityCommitments.length; ) {
            emit CourseMemberAdded(courseGroupId, identityCommitments[i]);

            unchecked {
                ++i;
            }
        }
    }

    /// @notice Returns the id the next created team will have.
    /// @return teamId Id that the next createTeam call will assign.
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
    ) external nonReentrant returns (uint256 teamId) {
        if (maxMembers == 0 || maxMembers > type(uint32).max) revert InvalidMaxMembers();
        if (revealAtBlock > type(uint64).max) revert InvalidRevealAtBlock();

        teamId = teamCounter;

        // The proof must be scoped to the team being created.
        if (proof.scope != teamId) revert InvalidScope();

        semaphore.validateProof(courseGroupId, proof);

        Team storage team = _teams[teamId];
        team.admin = msg.sender;
        team.maxMembers = uint32(maxMembers);
        team.revealAtBlock = uint64(revealAtBlock);
        team.name = name;
        team.description = description;
        team.memberNullifiers.push(proof.nullifier);

        // Safe: teamId equals the current counter, so it can never exceed type(uint256).max.
        unchecked {
            teamCounter = teamId + 1;
        }

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
    ) external nonReentrant {
        Team storage team = _teams[teamId];

        if (team.maxMembers == 0) revert TeamDoesNotExist(teamId);
        if (_isRevealed(team)) revert TeamAlreadyRevealed(teamId);
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

        emit JoinRequested(teamId, proof.nullifier, presentation);
    }

    /// @notice Accepts an applicant identified by their nullifier.
    /// @dev Only callable by the team admin.
    /// @param teamId Id of the team the applicant applied to.
    /// @param nullifier Pseudonym of the applicant to accept.
    function acceptRequest(uint256 teamId, uint256 nullifier) external {
        Team storage team = _teams[teamId];

        if (team.maxMembers == 0) revert TeamDoesNotExist(teamId);
        if (msg.sender != team.admin) revert NotTeamAdmin(teamId);
        if (_isRevealed(team)) revert TeamAlreadyRevealed(teamId);
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
    /// can be a throwaway address to keep the claimant's main address private. Claims
    /// are only possible once the team has been revealed, so the credential always
    /// attests membership in a finalized (frozen) team.
    function claimCredential(uint256 teamId, uint256 nullifier, address claimAddress, uint256 salt)
        external
        nonReentrant
    {
        if (credential == address(0)) revert CredentialNotSet();

        Team storage team = _teams[teamId];

        if (team.maxMembers == 0) revert TeamDoesNotExist(teamId);
        if (!_isRevealed(team)) revert TeamNotRevealed(teamId);

        Application storage application = _applications[teamId][nullifier];

        if (application.claimCommitment == bytes32(0)) revert ApplicationDoesNotExist(teamId, nullifier);
        if (!application.accepted) revert ApplicationNotAccepted(teamId, nullifier);
        if (application.claimed) revert ApplicationAlreadyClaimed(teamId, nullifier);

        bytes32 commitment = keccak256(abi.encode(claimAddress, salt));

        if (commitment != application.claimCommitment) revert InvalidClaimCommitment();

        // Effects before the external mint call (Checks-Effects-Interactions).
        application.claimed = true;

        ITeamCredential(credential).mint(claimAddress, teamId);

        emit CredentialClaimed(teamId, nullifier, claimAddress);
    }

    /// @notice Reveals the final team composition. Requires the team to be full or the
    /// reveal deadline to have passed.
    /// @dev Reveals nullifiers only; member addresses are never exposed by the contract.
    /// Also stores a commitment over the sorted nullifiers so the roster can be verified
    /// from a single hash regardless of the order in which members were accepted.
    function reveal(uint256 teamId) external {
        Team storage team = _teams[teamId];

        if (team.maxMembers == 0) revert TeamDoesNotExist(teamId);
        if (_isRevealed(team)) revert TeamAlreadyRevealed(teamId);

        uint256 memberCount = team.memberNullifiers.length;
        bool isFull = memberCount == team.maxMembers;
        bool deadlinePassed = team.revealAtBlock != 0 && block.number >= team.revealAtBlock;

        if (!isFull && !deadlinePassed) revert RevealConditionsNotMet(teamId);

        uint256[] memory sortedMembers = team.memberNullifiers;
        _sort(sortedMembers);

        // The root doubles as the revealed marker. A team always holds at least its
        // creator, so the hashed array is never empty and the root is never zero.
        team.rosterRoot = keccak256(abi.encodePacked(sortedMembers));

        emit TeamRevealed(teamId, sortedMembers);
    }

    /// @dev Tells whether a team was already revealed. The roster root is written exactly
    /// once, at reveal time, so it carries the revealed state on its own.
    function _isRevealed(Team storage team) private view returns (bool) {
        return team.rosterRoot != bytes32(0);
    }

    /// @dev Sorts a memory array of nullifiers in ascending order (insertion sort).
    /// Arrays are small (at most maxMembers), so the O(n^2) cost is negligible.
    function _sort(uint256[] memory values) private pure {
        uint256 length = values.length;

        for (uint256 i = 1; i < length; ) {
            uint256 key = values[i];
            uint256 j = i;

            while (j > 0 && values[j - 1] > key) {
                values[j] = values[j - 1];
                unchecked {
                    --j;
                }
            }

            values[j] = key;

            unchecked {
                ++i;
            }
        }
    }

    /// @notice Returns the full team data.
    /// @param teamId Id of the team to read.
    /// @return admin Address of the team administrator.
    /// @return name Public name of the team.
    /// @return description Public description of the team.
    /// @return maxMembers Maximum number of members, including the creator.
    /// @return revealAtBlock Block from which the team can be revealed even if not full.
    /// @return isRevealed Whether the team was already revealed.
    /// @return membersCount Number of members currently in the team.
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
            uint256(team.maxMembers),
            uint256(team.revealAtBlock),
            _isRevealed(team),
            team.memberNullifiers.length
        );
    }

    /// @notice Returns the nullifiers of the team members.
    /// @param teamId Id of the team to read.
    /// @return memberNullifiers The member pseudonyms, in acceptance order.
    function getTeamMembers(uint256 teamId) external view returns (uint256[] memory) {
        return _teams[teamId].memberNullifiers;
    }

    /// @notice Returns the roster commitment of a team, set when the team is revealed.
    /// @dev Equal to keccak256(abi.encodePacked(sorted member nullifiers)); zero until reveal.
    /// @param teamId Id of the team to read.
    /// @return rosterRoot Commitment over the sorted member nullifiers.
    function getTeamRosterRoot(uint256 teamId) external view returns (bytes32) {
        return _teams[teamId].rosterRoot;
    }

    /// @notice Returns an application by team and nullifier.
    /// @param teamId Id of the team the application belongs to.
    /// @param nullifier Pseudonym of the applicant.
    /// @return claimCommitment keccak256(abi.encode(claimAddress, salt)), zero when there
    /// is no application.
    /// @return accepted Whether the team admin accepted the application.
    /// @return claimed Whether the credential was already claimed.
    function getApplication(uint256 teamId, uint256 nullifier)
        external
        view
        returns (bytes32 claimCommitment, bool accepted, bool claimed)
    {
        Application storage application = _applications[teamId][nullifier];

        return (application.claimCommitment, application.accepted, application.claimed);
    }
}
