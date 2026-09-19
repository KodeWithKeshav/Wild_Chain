# Decisions

1. **Repo root.** Built directly in `Wild_Chain/` (the pasted repo) rather than a nested `wildlife-chain-of-custody/` folder.
2. **Spec sources.** `docs/blockchain_project_2.pdf` (text) matches the summary in the task. `Immutable_Wildlife_Protocol.pdf` is an image-only 10-slide deck (12 MB, not copied into the repo); the slides I inspected (lifecycle, on-chain vs IPFS) agree with the text spec.
3. **Auditor role dropped.** Spec lists five org types; the old Auditor role has no equivalent. Public read access replaces it.
4. **Reads are public.** No view-permission system (not in spec). Data on-chain is non-personal by design.
5. **Timeline is on-chain.** Spec asks for an append-only per-animal timeline; stored as a struct array. Gas cost documented as a limitation.
6. **`advanceStatus` role rules** follow the task table exactly. RELEASE_READY -> RELEASED is only via `releaseAnimal`.
7. **Release actor.** `releaseAnimal` callable by the current custodian or the authorizing ForestDepartment (as specified). Requires that org to still be active.
8. **Evidence "ever custodian" extension.** Implemented: any active org that has ever held custody may `addEvidence` (tracked via a `wasCustodian` mapping). Not allowed after RELEASED.
9. **Milestone verification.** Verifier must be an active org, different from the recorder's *address*. Verifier need not be custodian. Any org type may verify (simplest reading of "a different active organization").
10. **Registrant.** RescueTeam or ForestDepartment may register.
11. **Hash convention.** SHA-256 of raw file bytes as bytes32. Zero hash rejected where required: registration evidence, `addEvidence`, release permit. Optional (zero = omitted): `identityHash`, and the evidence on transfers, milestones and release. Any non-zero hash from those is also appended to the animal's evidence list so `verifyEvidenceHash` covers every on-chain hash.
12. **String bounds.** species <= 64, note <= 280, cid <= 100, evidenceType <= 32 bytes.
13. **Transfer matrix** stored as `mapping(uint8 => mapping(uint8 => bool))`; admin `setTransferAllowed`.
14. **Deactivation semantics.** A deactivated org cannot act. A pending transfer to/from it stays but cannot be accepted; the custodian may cancel (if active) and admin can reactivate.
15. **Custodian who is deactivated** cannot act; admin must reactivate (no admin override of custody, by design).
16. **Frontend reads** use `getTimeline`, `getCustodyHistory`, `getMilestones`, `getEvidence` per animal; no event indexing needed.
17. **Frontend Tailwind version** v3 (stable, simple PostCSS setup).
18. **Encryption stretch goal** not built.
19. **Pinata/web3.storage** documented only, per spec.

20. **`requestTransfer` takes an extra `cid` argument** (spec lists only `evidenceHash`) so the hand-over document's IPFS CID is stored with its hash.
21. **Evidence list is the single hash index.** Registration, transfer, milestone, permit and release files all land in it with a type label.
22. **Deployment file** `frontend/src/contracts/deployment.json` is keyed by chainId, one entry per network.
23. **Seed script** pins demo files to a local Kubo daemon if reachable, else uses `offline-demo-*` placeholder CIDs (hash verification works either way).
