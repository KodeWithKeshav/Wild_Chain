// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CustodyManager} from "./CustodyManager.sol";

/// @title TreatmentManager
/// @notice Milestones, forward-only lifecycle transitions, evidence uploads and release.
abstract contract TreatmentManager is CustodyManager {
    enum MilestoneType {
        ASSESSMENT,
        TREATMENT,
        RECOVERY,
        REHABILITATION
    }

    struct Milestone {
        MilestoneType milestoneType;
        address recordedBy;
        uint64 recordedAt;
        string note;
        bytes32 evidenceHash;
        string cid;
        bool verified;
        address verifiedBy;
        uint64 verifiedAt;
    }

    struct ReleaseAuthorization {
        bool authorized;
        address authorizedBy;
        uint64 authorizedAt;
        bytes32 permitHash;
        string permitCid;
    }

    struct ReleaseRecord {
        bool released;
        address releasedBy;
        uint64 releasedAt;
        string locationNote;
        bytes32 evidenceHash;
        string cid;
    }

    uint256 internal constant MAX_NOTE_LENGTH = 280;

    mapping(uint256 => Milestone[]) private _milestones;
    // animalId => milestone type => number recorded / number verified
    mapping(uint256 => mapping(MilestoneType => uint256)) private _recorded;
    mapping(uint256 => mapping(MilestoneType => uint256)) private _verified;
    mapping(uint256 => ReleaseAuthorization) private _releaseAuth;
    mapping(uint256 => ReleaseRecord) private _release;

    event MilestoneRecorded(uint256 indexed animalId, uint256 indexed index, MilestoneType milestoneType, address indexed recordedBy);
    event MilestoneVerified(uint256 indexed animalId, uint256 indexed index, address indexed verifiedBy);
    event StatusChanged(uint256 indexed animalId, Status from, Status to, address indexed actor);
    event ReleaseAuthorized(uint256 indexed animalId, address indexed authorizedBy, bytes32 permitHash, string cid);
    event AnimalReleasedEvent(uint256 indexed animalId, address indexed releasedBy, string locationNote);

    error MilestoneNotFound(uint256 animalId, uint256 index);
    error AlreadyVerified(uint256 animalId, uint256 index);
    error SelfVerification();
    error InvalidTransition(Status from, Status to);
    error MissingMilestone(MilestoneType required);
    error MissingVerifiedMilestone(MilestoneType required);
    error NotReleaseReady(uint256 animalId);
    error ReleaseNotAuthorized(uint256 animalId);
    error AlreadyAuthorized(uint256 animalId);
    error NotAuthorizedToRelease(uint256 animalId, address caller);
    error NotEvidenceContributor(uint256 animalId, address caller);
    error EmptyNote();

    // ----------------------------------------------------------- milestones

    /// @notice Records a milestone. Caller must be the current custodian with a role fitting the type:
    ///         ASSESSMENT (Vet or RescueTeam), TREATMENT/RECOVERY (Vet), REHABILITATION (Rehab).
    /// @param animalId The animal.
    /// @param mType Kind of milestone.
    /// @param note Short note (1-280 bytes, no personal data).
    /// @param evidenceHash Optional SHA-256 of supporting file (zero to omit).
    /// @param cid IPFS CID of that file (ignored when hash is zero).
    function recordMilestone(
        uint256 animalId,
        MilestoneType mType,
        string calldata note,
        bytes32 evidenceHash,
        string calldata cid
    ) external onlyCustodian(animalId) notReleased(animalId) returns (uint256 index) {
        _requireMilestoneRole(mType, orgTypeOf(msg.sender));
        if (bytes(note).length == 0) revert EmptyNote();
        _checkLength(note, MAX_NOTE_LENGTH);
        _checkLength(cid, MAX_CID_LENGTH);

        index = _milestones[animalId].length;
        _milestones[animalId].push(
            Milestone({
                milestoneType: mType,
                recordedBy: msg.sender,
                recordedAt: uint64(block.timestamp),
                note: note,
                evidenceHash: evidenceHash,
                cid: cid,
                verified: false,
                verifiedBy: address(0),
                verifiedAt: 0
            })
        );
        _recorded[animalId][mType]++;
        if (evidenceHash != bytes32(0)) {
            _pushEvidence(animalId, _milestoneLabel(mType), evidenceHash, cid, msg.sender);
        }
        _log(animalId, EventType.MilestoneRecorded, msg.sender, index);
        emit MilestoneRecorded(animalId, index, mType, msg.sender);
    }

    /// @notice A different active organization independently verifies a milestone.
    /// @param animalId The animal.
    /// @param index Milestone index (see `getMilestones`).
    function verifyMilestone(uint256 animalId, uint256 index)
        external
        animalExists(animalId)
        onlyActiveOrg
        notReleased(animalId)
    {
        if (index >= _milestones[animalId].length) revert MilestoneNotFound(animalId, index);
        Milestone storage m = _milestones[animalId][index];
        if (m.recordedBy == msg.sender) revert SelfVerification();
        if (m.verified) revert AlreadyVerified(animalId, index);

        m.verified = true;
        m.verifiedBy = msg.sender;
        m.verifiedAt = uint64(block.timestamp);
        _verified[animalId][m.milestoneType]++;
        _log(animalId, EventType.MilestoneVerified, msg.sender, index);
        emit MilestoneVerified(animalId, index, msg.sender);
    }

    /// @notice All milestones of an animal, oldest first.
    function getMilestones(uint256 animalId) external view animalExists(animalId) returns (Milestone[] memory) {
        return _milestones[animalId];
    }

    /// @notice How many milestones of a type were recorded and how many are verified.
    function milestoneCounts(uint256 animalId, MilestoneType mType)
        external
        view
        animalExists(animalId)
        returns (uint256 recorded, uint256 verified)
    {
        return (_recorded[animalId][mType], _verified[animalId][mType]);
    }

    // ------------------------------------------------------------ lifecycle

    /// @notice Moves the animal to the next lifecycle state (no skipping, no going back).
    ///         RELEASE_READY -> RELEASED is only possible through `releaseAnimal`.
    /// @param animalId The animal.
    /// @param newStatus Must be exactly the next state.
    function advanceStatus(uint256 animalId, Status newStatus)
        external
        onlyCustodian(animalId)
        noPendingTransfer(animalId)
    {
        Animal storage a = _animal(animalId);
        Status current = a.status;
        if (uint8(newStatus) != uint8(current) + 1 || newStatus == Status.RELEASED) {
            revert InvalidTransition(current, newStatus);
        }
        OrgType t = orgTypeOf(msg.sender);

        if (current == Status.RESCUED) {
            if (t != OrgType.RescueTeam && t != OrgType.VeterinaryHospital) revert RoleNotPermitted(t);
            if (_recorded[animalId][MilestoneType.ASSESSMENT] == 0) revert MissingMilestone(MilestoneType.ASSESSMENT);
        } else if (current == Status.TRIAGED) {
            if (t != OrgType.VeterinaryHospital) revert RoleNotPermitted(t);
        } else if (current == Status.UNDER_TREATMENT) {
            if (t != OrgType.VeterinaryHospital) revert RoleNotPermitted(t);
            if (_recorded[animalId][MilestoneType.TREATMENT] == 0) revert MissingMilestone(MilestoneType.TREATMENT);
        } else if (current == Status.RECOVERING) {
            if (t != OrgType.VeterinaryHospital && t != OrgType.RehabilitationCentre) revert RoleNotPermitted(t);
            if (_recorded[animalId][MilestoneType.RECOVERY] == 0) revert MissingMilestone(MilestoneType.RECOVERY);
        } else {
            // REHABILITATION -> RELEASE_READY
            if (t != OrgType.RehabilitationCentre) revert RoleNotPermitted(t);
            if (_verified[animalId][MilestoneType.TREATMENT] == 0) revert MissingVerifiedMilestone(MilestoneType.TREATMENT);
            if (_verified[animalId][MilestoneType.REHABILITATION] == 0) {
                revert MissingVerifiedMilestone(MilestoneType.REHABILITATION);
            }
        }

        a.status = newStatus;
        _log(animalId, EventType.StatusChanged, msg.sender, uint256(newStatus));
        emit StatusChanged(animalId, current, newStatus, msg.sender);
    }

    // -------------------------------------------------------------- release

    /// @notice A ForestDepartment authorizes release of a RELEASE_READY animal (custody not required).
    /// @param animalId The animal.
    /// @param permitHash SHA-256 of the release permit document (required).
    /// @param cid IPFS CID of the permit.
    function authorizeRelease(uint256 animalId, bytes32 permitHash, string calldata cid)
        external
        animalExists(animalId)
        onlyActiveOrg
    {
        OrgType t = orgTypeOf(msg.sender);
        if (t != OrgType.ForestDepartment) revert RoleNotPermitted(t);
        if (_animal(animalId).status != Status.RELEASE_READY) revert NotReleaseReady(animalId);
        if (_releaseAuth[animalId].authorized) revert AlreadyAuthorized(animalId);
        if (permitHash == bytes32(0)) revert ZeroHash();
        _checkLength(cid, MAX_CID_LENGTH);

        _releaseAuth[animalId] = ReleaseAuthorization({
            authorized: true,
            authorizedBy: msg.sender,
            authorizedAt: uint64(block.timestamp),
            permitHash: permitHash,
            permitCid: cid
        });
        _pushEvidence(animalId, "RELEASE_PERMIT", permitHash, cid, msg.sender);
        _log(animalId, EventType.ReleaseAuthorized, msg.sender, 0);
        emit ReleaseAuthorized(animalId, msg.sender, permitHash, cid);
    }

    /// @notice Releases the animal back to the wild (terminal state). Callable by the current
    ///         custodian or the authorizing ForestDepartment, only after authorization.
    /// @param animalId The animal.
    /// @param locationNote Short release-location note (1-280 bytes).
    /// @param evidenceHash Optional SHA-256 of release evidence (zero to omit).
    /// @param cid IPFS CID of that evidence.
    function releaseAnimal(uint256 animalId, string calldata locationNote, bytes32 evidenceHash, string calldata cid)
        external
        animalExists(animalId)
        onlyActiveOrg
        noPendingTransfer(animalId)
    {
        Animal storage a = _animal(animalId);
        if (a.status != Status.RELEASE_READY) revert NotReleaseReady(animalId);
        ReleaseAuthorization storage auth = _releaseAuth[animalId];
        if (!auth.authorized) revert ReleaseNotAuthorized(animalId);
        if (msg.sender != a.currentCustodian && msg.sender != auth.authorizedBy) {
            revert NotAuthorizedToRelease(animalId, msg.sender);
        }
        if (bytes(locationNote).length == 0) revert EmptyNote();
        _checkLength(locationNote, MAX_NOTE_LENGTH);
        _checkLength(cid, MAX_CID_LENGTH);

        a.status = Status.RELEASED;
        _release[animalId] = ReleaseRecord({
            released: true,
            releasedBy: msg.sender,
            releasedAt: uint64(block.timestamp),
            locationNote: locationNote,
            evidenceHash: evidenceHash,
            cid: cid
        });
        if (evidenceHash != bytes32(0)) {
            _pushEvidence(animalId, "RELEASE", evidenceHash, cid, msg.sender);
        }
        _log(animalId, EventType.Released, msg.sender, uint256(Status.RELEASED));
        emit AnimalReleasedEvent(animalId, msg.sender, locationNote);
    }

    /// @notice Release authorization of an animal (`authorized` false if none yet).
    function getReleaseAuthorization(uint256 animalId)
        external
        view
        animalExists(animalId)
        returns (ReleaseAuthorization memory)
    {
        return _releaseAuth[animalId];
    }

    /// @notice Release record of an animal (`released` false until released).
    function getReleaseRecord(uint256 animalId) external view animalExists(animalId) returns (ReleaseRecord memory) {
        return _release[animalId];
    }

    // -------------------------------------------------------------- evidence

    /// @notice Adds a piece of evidence (photo, report, ...). Custodian, or any active organization
    ///         that has ever held custody of the animal.
    /// @param animalId The animal.
    /// @param evidenceType Short label, e.g. "MEDICAL_REPORT" (1-32 bytes).
    /// @param sha256Hash SHA-256 of the raw file bytes (required).
    /// @param cid IPFS CID of the file (required).
    function addEvidence(uint256 animalId, string calldata evidenceType, bytes32 sha256Hash, string calldata cid)
        external
        animalExists(animalId)
        onlyActiveOrg
        notReleased(animalId)
    {
        if (!wasCustodian[animalId][msg.sender]) revert NotEvidenceContributor(animalId, msg.sender);
        uint256 typeLen = bytes(evidenceType).length;
        if (typeLen == 0) revert EmptyNote();
        if (typeLen > MAX_EVIDENCE_TYPE_LENGTH) revert StringTooLong(MAX_EVIDENCE_TYPE_LENGTH);
        if (sha256Hash == bytes32(0)) revert ZeroHash();
        if (bytes(cid).length == 0) revert EmptyCid();
        _checkLength(cid, MAX_CID_LENGTH);

        uint256 index = _pushEvidence(animalId, evidenceType, sha256Hash, cid, msg.sender);
        _log(animalId, EventType.EvidenceAdded, msg.sender, index);
    }

    // ------------------------------------------------------------- internal

    function _requireMilestoneRole(MilestoneType mType, OrgType t) private pure {
        bool ok;
        if (mType == MilestoneType.ASSESSMENT) {
            ok = t == OrgType.VeterinaryHospital || t == OrgType.RescueTeam;
        } else if (mType == MilestoneType.REHABILITATION) {
            ok = t == OrgType.RehabilitationCentre;
        } else {
            ok = t == OrgType.VeterinaryHospital; // TREATMENT, RECOVERY
        }
        if (!ok) revert RoleNotPermitted(t);
    }

    function _milestoneLabel(MilestoneType mType) private pure returns (string memory) {
        if (mType == MilestoneType.ASSESSMENT) return "MILESTONE_ASSESSMENT";
        if (mType == MilestoneType.TREATMENT) return "MILESTONE_TREATMENT";
        if (mType == MilestoneType.RECOVERY) return "MILESTONE_RECOVERY";
        return "MILESTONE_REHAB";
    }
}
