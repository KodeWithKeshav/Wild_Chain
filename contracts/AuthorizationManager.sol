// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AuthorizationManager
/// @notice Registry of organizations allowed to act in the wildlife chain of custody,
///         plus a data-driven matrix of which organization types may hand custody to which.
/// @dev The deployer is the owner/admin. Unregistered or deactivated addresses can do nothing.
abstract contract AuthorizationManager is Ownable {
    /// @notice Kinds of organizations that take part in a rescue.
    enum OrgType {
        RescueTeam,
        VeterinaryHospital,
        RehabilitationCentre,
        ForestDepartment,
        ConservationOrg
    }

    uint8 internal constant ORG_TYPE_COUNT = 5;
    uint256 internal constant MAX_NAME_LENGTH = 64;

    struct Organization {
        string name;
        OrgType orgType;
        bool registered;
        bool active;
        uint64 registeredAt;
    }

    mapping(address => Organization) private _organizations;
    address[] private _organizationList;

    /// @notice Whether custody may move from an organization type to another type.
    mapping(OrgType => mapping(OrgType => bool)) public allowedTransfer;

    event OrganizationRegistered(address indexed account, string name, OrgType orgType);
    event OrganizationDeactivated(address indexed account);
    event OrganizationReactivated(address indexed account);
    event TransferRuleChanged(OrgType indexed fromType, OrgType indexed toType, bool allowed);

    error InvalidAddress();
    error EmptyName();
    error StringTooLong(uint256 maxLength);
    error AlreadyRegistered(address account);
    error NotRegistered(address account);
    error AlreadyActive(address account);
    error AlreadyInactive(address account);
    error NotActiveOrganization(address account);
    error WrongOrganizationType(OrgType actual);

    /// @dev Reverts unless the caller is a registered and active organization.
    modifier onlyActiveOrg() {
        if (!_organizations[msg.sender].active) revert NotActiveOrganization(msg.sender);
        _;
    }

    constructor() Ownable(msg.sender) {
        // RescueTeam -> Vet, Rehab, ForestDept
        _setRule(OrgType.RescueTeam, OrgType.VeterinaryHospital, true);
        _setRule(OrgType.RescueTeam, OrgType.RehabilitationCentre, true);
        _setRule(OrgType.RescueTeam, OrgType.ForestDepartment, true);
        // Vet -> Rehab, ForestDept, ConservationOrg, RescueTeam
        _setRule(OrgType.VeterinaryHospital, OrgType.RehabilitationCentre, true);
        _setRule(OrgType.VeterinaryHospital, OrgType.ForestDepartment, true);
        _setRule(OrgType.VeterinaryHospital, OrgType.ConservationOrg, true);
        _setRule(OrgType.VeterinaryHospital, OrgType.RescueTeam, true);
        // Rehab -> Vet, ForestDept, ConservationOrg
        _setRule(OrgType.RehabilitationCentre, OrgType.VeterinaryHospital, true);
        _setRule(OrgType.RehabilitationCentre, OrgType.ForestDepartment, true);
        _setRule(OrgType.RehabilitationCentre, OrgType.ConservationOrg, true);
        // ForestDept -> RescueTeam, Vet, Rehab, ConservationOrg
        _setRule(OrgType.ForestDepartment, OrgType.RescueTeam, true);
        _setRule(OrgType.ForestDepartment, OrgType.VeterinaryHospital, true);
        _setRule(OrgType.ForestDepartment, OrgType.RehabilitationCentre, true);
        _setRule(OrgType.ForestDepartment, OrgType.ConservationOrg, true);
        // ConservationOrg -> Vet, Rehab, ForestDept
        _setRule(OrgType.ConservationOrg, OrgType.VeterinaryHospital, true);
        _setRule(OrgType.ConservationOrg, OrgType.RehabilitationCentre, true);
        _setRule(OrgType.ConservationOrg, OrgType.ForestDepartment, true);
    }

    // ---------------------------------------------------------------- admin

    /// @notice Registers a new organization (starts active). Owner only.
    /// @param account Wallet address of the organization.
    /// @param name Human-readable name (1-64 bytes, no personal data).
    /// @param orgType The kind of organization.
    function registerOrganization(address account, string calldata name, OrgType orgType) external onlyOwner {
        if (account == address(0)) revert InvalidAddress();
        uint256 len = bytes(name).length;
        if (len == 0) revert EmptyName();
        if (len > MAX_NAME_LENGTH) revert StringTooLong(MAX_NAME_LENGTH);
        if (_organizations[account].registered) revert AlreadyRegistered(account);

        _organizations[account] = Organization({
            name: name,
            orgType: orgType,
            registered: true,
            active: true,
            registeredAt: uint64(block.timestamp)
        });
        _organizationList.push(account);
        emit OrganizationRegistered(account, name, orgType);
    }

    /// @notice Deactivates an organization; it can no longer act until reactivated. Owner only.
    /// @param account The organization to deactivate.
    function deactivateOrganization(address account) external onlyOwner {
        Organization storage org = _organizations[account];
        if (!org.registered) revert NotRegistered(account);
        if (!org.active) revert AlreadyInactive(account);
        org.active = false;
        emit OrganizationDeactivated(account);
    }

    /// @notice Reactivates a previously deactivated organization. Owner only.
    /// @param account The organization to reactivate.
    function reactivateOrganization(address account) external onlyOwner {
        Organization storage org = _organizations[account];
        if (!org.registered) revert NotRegistered(account);
        if (org.active) revert AlreadyActive(account);
        org.active = true;
        emit OrganizationReactivated(account);
    }

    /// @notice Changes one cell of the custody transfer matrix. Owner only.
    /// @param fromType Type of the organization handing custody over.
    /// @param toType Type of the organization receiving custody.
    /// @param allowed Whether such transfers are permitted.
    function setTransferAllowed(OrgType fromType, OrgType toType, bool allowed) external onlyOwner {
        _setRule(fromType, toType, allowed);
    }

    // ---------------------------------------------------------------- views

    /// @notice Whether the address is a registered, active organization.
    function isActive(address account) public view returns (bool) {
        return _organizations[account].active;
    }

    /// @notice Organization type of a registered address (reverts if not registered).
    function orgTypeOf(address account) public view returns (OrgType) {
        if (!_organizations[account].registered) revert NotRegistered(account);
        return _organizations[account].orgType;
    }

    /// @notice Full organization record (empty/false for unregistered addresses).
    function getOrganization(address account) external view returns (Organization memory) {
        return _organizations[account];
    }

    /// @notice Number of organizations ever registered.
    function organizationCount() external view returns (uint256) {
        return _organizationList.length;
    }

    /// @notice Address of the i-th registered organization.
    function organizationAt(uint256 index) external view returns (address) {
        return _organizationList[index];
    }

    /// @notice The whole transfer matrix, indexed [fromType][toType].
    function transferMatrix() external view returns (bool[5][5] memory matrix) {
        for (uint8 f = 0; f < ORG_TYPE_COUNT; f++) {
            for (uint8 t = 0; t < ORG_TYPE_COUNT; t++) {
                matrix[f][t] = allowedTransfer[OrgType(f)][OrgType(t)];
            }
        }
    }

    // ------------------------------------------------------------- internal

    function _setRule(OrgType fromType, OrgType toType, bool allowed) private {
        allowedTransfer[fromType][toType] = allowed;
        emit TransferRuleChanged(fromType, toType, allowed);
    }

    /// @dev Reverts if the string is longer than `maxLength` bytes.
    function _checkLength(string memory value, uint256 maxLength) internal pure {
        if (bytes(value).length > maxLength) revert StringTooLong(maxLength);
    }
}
