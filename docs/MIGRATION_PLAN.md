# Migration plan: MediLink / PharmaChain -> Wildlife Rescue Chain-of-Custody

## File inventory (audited before removal)

| Old file | Class | Notes |
|---|---|---|
| `PharmaChain_Final/contracts/SupplyChain.sol` | REWRITE | Single 308-line contract -> four abstract modules + one deployable contract |
| `PharmaChain_Final/test/supplyChain.test.js` | REWRITE | 5 Truffle tests -> Hardhat + chai TypeScript suite |
| `PharmaChain_Final/migrations/2_deploy_contracts.js` | REMOVE | Replaced by `scripts/deploy.ts` |
| `PharmaChain_Final/truffle-config.js` | REMOVE | Replaced by `hardhat.config.ts` |
| `PharmaChain_Final/build/contracts/SupplyChain.json` | REMOVE | Truffle build artifact |
| `PharmaChain_Final/{contracts,migrations,test}/.gitkeep` | REMOVE | Placeholders |
| `front.html` | REWRITE | 907-line Web3.js single page -> Vite + React + Tailwind + Ethers v6 app |
| `test-commands.txt` | REMOVE | Truffle console notes |
| `README.md` | REWRITE | Rewritten from scratch |
| `.DS_Store` files | REMOVE | Junk |

Nothing was KEPT verbatim; ideas were reused (see mapping).

## Concept mapping

| Old | New |
|---|---|
| Entity + role (Manufacturer/Distributor/Dispenser/Auditor) | Organization + `OrgType` (RescueTeam, VeterinaryHospital, RehabilitationCentre, ForestDepartment, ConservationOrg) |
| Owner-only `registerEntity` / `deactivateEntity` | Owner-only `registerOrganization` / `deactivateOrganization` / `reactivateOrganization` |
| Serial number + owner | Animal ID + current custodian |
| `registerProduct` | `registerAnimal` |
| Transaction + per-entity history | Custody transfer (two-party) + per-animal custody history |
| `documentHash` on a transaction | `evidenceHash` + IPFS `cid` on transfers, milestones, evidence |
| Product status ACTIVE/EXPIRED/RECALLED | 7-state forward-only lifecycle |
| Auditor role | Dropped as a role; `verifyMilestone` (independent second org) + read-only public timeline replace it |
| Batch, serial locks, expiry, recall, bulk transaction, urgent broadcast, view permissions | DROPPED (not in spec) |

## Old defects not carried over
- Roles were never checked on transfer -> new data-driven transfer matrix.
- `lockExpiry` never enforced -> feature dropped.
- Receiver role not validated -> matrix + active checks.
