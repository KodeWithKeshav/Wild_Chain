// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AuthorizationManager} from "./AuthorizationManager.sol";

/// @title AnimalRegistry
/// @notice One physical animal -> one digital identity. Holds animal records, the append-only
///         evidence list and the append-only event timeline shared by the other modules.
abstract contract AnimalRegistry is AuthorizationManager {
    /// @notice Strict, forward-only lifecycle.
    enum Status {
        RESCUED,
        TRIAGED,
        UNDER_TREATMENT,
        RECOVERING,
        REHABILITATION,
        RELEASE_READY,
        RELEASED
    }

    /// @notice Kinds of timeline events.
    enum EventType {
        Registered,
        TransferRequested,
        TransferAccepted,
        TransferCancelled,
        TransferRejected,
        MilestoneRecorded,
        MilestoneVerified,
        StatusChanged,
        EvidenceAdded,
        ReleaseAuthorized,
        Released
    }

    struct Animal {
        uint256 id;
        string species;
        bytes32 identityHash;
        Status status;
        address currentCustodian;
        address previousCustodian;
        address registeredBy;
        uint64 registeredAt;
        address pendingTransferTo;
    }

    struct Evidence {
        string evidenceType;
        bytes32 hash; // SHA-256 of the raw file bytes
        string cid; // IPFS content identifier
        address uploadedBy;
        uint64 uploadedAt;
    }

    struct TimelineEntry {
        EventType eventType;
        address actor;
        uint64 timestamp;
        uint256 refIndex; // meaning depends on eventType (milestone/evidence/history index, or new status)
    }

    uint256 internal constant MAX_SPECIES_LENGTH = 64;
    uint256 internal constant MAX_CID_LENGTH = 100;
    uint256 internal constant MAX_EVIDENCE_TYPE_LENGTH = 32;

    uint256 public animalCount;

    mapping(uint256 => Animal) private _animals;
    mapping(uint256 => Evidence[]) private _evidence;
    mapping(uint256 => TimelineEntry[]) private _timeline;
    /// @notice Whether an organization has ever held custody of an animal.
    mapping(uint256 => mapping(address => bool)) public wasCustodian;

    event AnimalRegistered(uint256 indexed animalId, string species, address indexed custodian, bytes32 evidenceHash, string cid);
    event EvidenceAdded(uint256 indexed animalId, uint256 indexed index, string evidenceType, bytes32 hash, string cid, address indexed uploadedBy);
    event TimelineEvent(uint256 indexed animalId, EventType indexed eventType, address indexed actor, uint256 refIndex);

    error AnimalNotFound(uint256 animalId);
    error EmptySpecies();
    error ZeroHash();
    error EmptyCid();
    error NotCustodian(uint256 animalId, address caller);
    error AnimalReleased(uint256 animalId);
    error TransferPending(uint256 animalId);
    error RoleNotPermitted(OrgType orgType);

    modifier animalExists(uint256 animalId) {
        if (animalId == 0 || animalId > animalCount) revert AnimalNotFound(animalId);
        _;
    }

    /// @dev Caller must be the active current custodian of the animal.
    modifier onlyCustodian(uint256 animalId) {
        if (animalId == 0 || animalId > animalCount) revert AnimalNotFound(animalId);
        if (!isActive(msg.sender)) revert NotActiveOrganization(msg.sender);
        if (_animals[animalId].currentCustodian != msg.sender) revert NotCustodian(animalId, msg.sender);
        _;
    }

    /// @dev Animal must not be in the terminal RELEASED state.
    modifier notReleased(uint256 animalId) {
        if (_animals[animalId].status == Status.RELEASED) revert AnimalReleased(animalId);
        _;
    }

    /// @dev No custody transfer may be pending for the animal.
    modifier noPendingTransfer(uint256 animalId) {
        if (_animals[animalId].pendingTransferTo != address(0)) revert TransferPending(animalId);
        _;
    }

    /// @notice Registers a rescued animal. Callable by an active RescueTeam or ForestDepartment.
    /// @param species Species name (1-64 bytes).
    /// @param identityHash Optional hash of a tag/microchip/photo identifier (may be zero).
    /// @param evidenceHash SHA-256 of the initial rescue evidence file (required).
    /// @param cid IPFS CID of that evidence (required).
    /// @return animalId The new animal's ID.
    function registerAnimal(string calldata species, bytes32 identityHash, bytes32 evidenceHash, string calldata cid)
        external
        onlyActiveOrg
        returns (uint256 animalId)
    {
        OrgType t = orgTypeOf(msg.sender);
        if (t != OrgType.RescueTeam && t != OrgType.ForestDepartment) revert RoleNotPermitted(t);
        uint256 len = bytes(species).length;
        if (len == 0) revert EmptySpecies();
        if (len > MAX_SPECIES_LENGTH) revert StringTooLong(MAX_SPECIES_LENGTH);
        if (evidenceHash == bytes32(0)) revert ZeroHash();
        if (bytes(cid).length == 0) revert EmptyCid();
        _checkLength(cid, MAX_CID_LENGTH);

        animalId = ++animalCount;
        _animals[animalId] = Animal({
            id: animalId,
            species: species,
            identityHash: identityHash,
            status: Status.RESCUED,
            currentCustodian: msg.sender,
            previousCustodian: address(0),
            registeredBy: msg.sender,
            registeredAt: uint64(block.timestamp),
            pendingTransferTo: address(0)
        });
        wasCustodian[animalId][msg.sender] = true;

        _pushEvidence(animalId, "RESCUE", evidenceHash, cid, msg.sender);
        _log(animalId, EventType.Registered, msg.sender, 0);
        emit AnimalRegistered(animalId, species, msg.sender, evidenceHash, cid);
    }

    /// @notice Returns an animal record.
    function getAnimal(uint256 animalId) external view animalExists(animalId) returns (Animal memory) {
        return _animals[animalId];
    }

    /// @notice All evidence records of an animal (registration, transfers, milestones, permits, uploads).
    function getEvidence(uint256 animalId) external view animalExists(animalId) returns (Evidence[] memory) {
        return _evidence[animalId];
    }

    /// @notice Number of evidence records of an animal.
    function evidenceCount(uint256 animalId) external view animalExists(animalId) returns (uint256) {
        return _evidence[animalId].length;
    }

    /// @notice Looks up a file hash among an animal's on-chain evidence.
    /// @param animalId The animal.
    /// @param hash SHA-256 (as bytes32) of the file being verified.
    /// @return found True if the hash was recorded (MATCH), false if not (MISMATCH / modified).
    /// @return index Index into `getEvidence(animalId)` of the first record with that hash.
    function verifyEvidenceHash(uint256 animalId, bytes32 hash)
        external
        view
        animalExists(animalId)
        returns (bool found, uint256 index)
    {
        Evidence[] storage list = _evidence[animalId];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i].hash == hash) return (true, i);
        }
        return (false, 0);
    }

    /// @notice Chronological, append-only event timeline of an animal.
    function getTimeline(uint256 animalId) external view animalExists(animalId) returns (TimelineEntry[] memory) {
        return _timeline[animalId];
    }

    // ------------------------------------------------------------- internal

    function _animal(uint256 animalId) internal view returns (Animal storage) {
        return _animals[animalId];
    }

    function _evidenceLength(uint256 animalId) internal view returns (uint256) {
        return _evidence[animalId].length;
    }

    function _pushEvidence(uint256 animalId, string memory evidenceType, bytes32 hash, string memory cid, address by)
        internal
        returns (uint256 index)
    {
        index = _evidence[animalId].length;
        _evidence[animalId].push(
            Evidence({evidenceType: evidenceType, hash: hash, cid: cid, uploadedBy: by, uploadedAt: uint64(block.timestamp)})
        );
        emit EvidenceAdded(animalId, index, evidenceType, hash, cid, by);
    }

    function _log(uint256 animalId, EventType eventType, address actor, uint256 refIndex) internal {
        _timeline[animalId].push(
            TimelineEntry({eventType: eventType, actor: actor, timestamp: uint64(block.timestamp), refIndex: refIndex})
        );
        emit TimelineEvent(animalId, eventType, actor, refIndex);
    }
}
