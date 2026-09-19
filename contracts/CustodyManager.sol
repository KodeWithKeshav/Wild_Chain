// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AnimalRegistry} from "./AnimalRegistry.sol";

/// @title CustodyManager
/// @notice Two-party custody handshake: the current custodian requests, the receiving
///         organization accepts, and only then does custody change.
abstract contract CustodyManager is AnimalRegistry {
    struct CustodyRecord {
        address from;
        address to;
        uint64 requestedAt;
        uint64 acceptedAt;
        bytes32 evidenceHash;
    }

    struct PendingRequest {
        uint64 requestedAt;
        bytes32 evidenceHash;
    }

    mapping(uint256 => CustodyRecord[]) private _custodyHistory;
    mapping(uint256 => PendingRequest) private _pending;

    event TransferRequested(uint256 indexed animalId, address indexed from, address indexed to, bytes32 evidenceHash);
    event TransferAccepted(uint256 indexed animalId, address indexed from, address indexed to);
    event TransferCancelled(uint256 indexed animalId, address indexed from, address indexed to);
    event TransferRejected(uint256 indexed animalId, address indexed from, address indexed to);

    error InvalidRecipient();
    error TransferNotAllowed(OrgType fromType, OrgType toType);
    error NoPendingTransfer(uint256 animalId);
    error NotPendingRecipient(uint256 animalId, address caller);

    /// @notice Current custodian proposes handing the animal to another organization.
    /// @param animalId The animal.
    /// @param to Receiving organization (must be active and allowed by the transfer matrix).
    /// @param evidenceHash Optional SHA-256 of a hand-over document (zero to omit).
    function requestTransfer(uint256 animalId, address to, bytes32 evidenceHash, string calldata cid)
        external
        onlyCustodian(animalId)
        notReleased(animalId)
        noPendingTransfer(animalId)
    {
        if (to == msg.sender || to == address(0)) revert InvalidRecipient();
        if (!isActive(to)) revert NotActiveOrganization(to);
        OrgType fromType = orgTypeOf(msg.sender);
        OrgType toType = orgTypeOf(to);
        if (!allowedTransfer[fromType][toType]) revert TransferNotAllowed(fromType, toType);
        _checkLength(cid, MAX_CID_LENGTH);

        _animal(animalId).pendingTransferTo = to;
        _pending[animalId] = PendingRequest({requestedAt: uint64(block.timestamp), evidenceHash: evidenceHash});
        if (evidenceHash != bytes32(0)) {
            _pushEvidence(animalId, "TRANSFER", evidenceHash, cid, msg.sender);
        }
        _log(animalId, EventType.TransferRequested, msg.sender, _custodyHistory[animalId].length);
        emit TransferRequested(animalId, msg.sender, to, evidenceHash);
    }

    /// @notice The receiving organization accepts custody. Only now does custody change.
    /// @param animalId The animal.
    function acceptTransfer(uint256 animalId) external animalExists(animalId) {
        Animal storage a = _animal(animalId);
        address recipient = a.pendingTransferTo;
        if (recipient == address(0)) revert NoPendingTransfer(animalId);
        if (recipient != msg.sender) revert NotPendingRecipient(animalId, msg.sender);
        if (!isActive(msg.sender)) revert NotActiveOrganization(msg.sender);

        PendingRequest memory p = _pending[animalId];
        address from = a.currentCustodian;

        a.previousCustodian = from;
        a.currentCustodian = recipient;
        a.pendingTransferTo = address(0);
        delete _pending[animalId];
        wasCustodian[animalId][recipient] = true;

        uint256 historyIndex = _custodyHistory[animalId].length;
        _custodyHistory[animalId].push(
            CustodyRecord({
                from: from,
                to: recipient,
                requestedAt: p.requestedAt,
                acceptedAt: uint64(block.timestamp),
                evidenceHash: p.evidenceHash
            })
        );
        _log(animalId, EventType.TransferAccepted, msg.sender, historyIndex);
        emit TransferAccepted(animalId, from, recipient);
    }

    /// @notice The current custodian withdraws a pending transfer request.
    /// @param animalId The animal.
    function cancelTransfer(uint256 animalId) external onlyCustodian(animalId) {
        Animal storage a = _animal(animalId);
        address recipient = a.pendingTransferTo;
        if (recipient == address(0)) revert NoPendingTransfer(animalId);
        a.pendingTransferTo = address(0);
        delete _pending[animalId];
        _log(animalId, EventType.TransferCancelled, msg.sender, 0);
        emit TransferCancelled(animalId, msg.sender, recipient);
    }

    /// @notice The intended recipient declines a pending transfer.
    /// @param animalId The animal.
    function rejectTransfer(uint256 animalId) external animalExists(animalId) {
        Animal storage a = _animal(animalId);
        address recipient = a.pendingTransferTo;
        if (recipient == address(0)) revert NoPendingTransfer(animalId);
        if (recipient != msg.sender) revert NotPendingRecipient(animalId, msg.sender);
        if (!isActive(msg.sender)) revert NotActiveOrganization(msg.sender);
        a.pendingTransferTo = address(0);
        delete _pending[animalId];
        _log(animalId, EventType.TransferRejected, msg.sender, 0);
        emit TransferRejected(animalId, a.currentCustodian, msg.sender);
    }

    /// @notice Accepted custody transfers of an animal, oldest first.
    function getCustodyHistory(uint256 animalId) external view animalExists(animalId) returns (CustodyRecord[] memory) {
        return _custodyHistory[animalId];
    }

    /// @notice The pending request of an animal (recipient is zero if none).
    function getPendingTransfer(uint256 animalId)
        external
        view
        animalExists(animalId)
        returns (address to, uint64 requestedAt, bytes32 evidenceHash)
    {
        PendingRequest memory p = _pending[animalId];
        return (_animal(animalId).pendingTransferTo, p.requestedAt, p.evidenceHash);
    }
}
