// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TreatmentManager} from "./TreatmentManager.sol";

/// @title WildlifeChainOfCustody
/// @notice Single deployable contract composing AuthorizationManager, AnimalRegistry,
///         CustodyManager and TreatmentManager by inheritance. One address, one ABI.
/// @dev Prototype, not audited. The owner is a trusted administrator of the organization list.
contract WildlifeChainOfCustody is TreatmentManager {
    constructor() {}
}
