import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { CID, Ev, MType, OrgType, Status, ZERO, animalAt, deployFixture, h, registeredFixture } from "./helpers";

describe("WildlifeChainOfCustody", () => {
  // --------------------------------------------------------------- admin
  describe("Authorization / admin", () => {
    it("owner registers, deactivates and reactivates organizations with events", async () => {
      const { chain, owner, outsider } = await loadFixture(deployFixture);
      await expect(chain.registerOrganization(outsider.address, "New Org", OrgType.Conservation))
        .to.emit(chain, "OrganizationRegistered")
        .withArgs(outsider.address, "New Org", OrgType.Conservation);
      expect(await chain.isActive(outsider.address)).to.equal(true);
      expect(await chain.orgTypeOf(outsider.address)).to.equal(OrgType.Conservation);
      await expect(chain.deactivateOrganization(outsider.address))
        .to.emit(chain, "OrganizationDeactivated")
        .withArgs(outsider.address);
      expect(await chain.isActive(outsider.address)).to.equal(false);
      await expect(chain.reactivateOrganization(outsider.address))
        .to.emit(chain, "OrganizationReactivated")
        .withArgs(outsider.address);
      expect(await chain.isActive(outsider.address)).to.equal(true);
      expect(await chain.owner()).to.equal(owner.address);
    });

    it("validates admin inputs and state", async () => {
      const { chain, rescue, outsider } = await loadFixture(deployFixture);
      await expect(chain.registerOrganization(ethers.ZeroAddress, "x", 0)).to.be.revertedWithCustomError(chain, "InvalidAddress");
      await expect(chain.registerOrganization(outsider.address, "", 0)).to.be.revertedWithCustomError(chain, "EmptyName");
      await expect(chain.registerOrganization(outsider.address, "x".repeat(65), 0)).to.be.revertedWithCustomError(chain, "StringTooLong");
      await expect(chain.registerOrganization(rescue.address, "dup", 0)).to.be.revertedWithCustomError(chain, "AlreadyRegistered");
      await expect(chain.deactivateOrganization(outsider.address)).to.be.revertedWithCustomError(chain, "NotRegistered");
      await expect(chain.reactivateOrganization(outsider.address)).to.be.revertedWithCustomError(chain, "NotRegistered");
      await expect(chain.reactivateOrganization(rescue.address)).to.be.revertedWithCustomError(chain, "AlreadyActive");
      await chain.deactivateOrganization(rescue.address);
      await expect(chain.deactivateOrganization(rescue.address)).to.be.revertedWithCustomError(chain, "AlreadyInactive");
      await expect(chain.orgTypeOf(outsider.address)).to.be.revertedWithCustomError(chain, "NotRegistered");
    });

    it("only the owner can administer", async () => {
      const { chain, rescue, outsider } = await loadFixture(deployFixture);
      const c = chain.connect(rescue);
      await expect(c.registerOrganization(outsider.address, "x", 0)).to.be.revertedWithCustomError(chain, "OwnableUnauthorizedAccount");
      await expect(c.deactivateOrganization(rescue.address)).to.be.revertedWithCustomError(chain, "OwnableUnauthorizedAccount");
      await expect(c.reactivateOrganization(rescue.address)).to.be.revertedWithCustomError(chain, "OwnableUnauthorizedAccount");
      await expect(c.setTransferAllowed(0, 1, false)).to.be.revertedWithCustomError(chain, "OwnableUnauthorizedAccount");
    });

    it("exposes the organization list and default transfer matrix", async () => {
      const { chain, rescue } = await loadFixture(deployFixture);
      expect(await chain.organizationCount()).to.equal(6);
      expect(await chain.organizationAt(0)).to.equal(rescue.address);
      const org = await chain.getOrganization(rescue.address);
      expect(org.name).to.equal("Coastal Rescue Team");
      const m = await chain.transferMatrix();
      expect(m[OrgType.Rescue][OrgType.Vet]).to.equal(true);
      expect(m[OrgType.Rescue][OrgType.Conservation]).to.equal(false);
      expect(m[OrgType.Vet][OrgType.Rescue]).to.equal(true);
      expect(m[OrgType.Rehab][OrgType.Rescue]).to.equal(false);
      expect(m[OrgType.Conservation][OrgType.Rescue]).to.equal(false);
    });

    it("admin can update the transfer matrix", async () => {
      const { chain, rescue, conservation } = await loadFixture(registeredFixture);
      await expect(chain.connect(rescue).requestTransfer(1, conservation.address, ZERO, "")).to.be.revertedWithCustomError(chain, "TransferNotAllowed");
      await expect(chain.setTransferAllowed(OrgType.Rescue, OrgType.Conservation, true))
        .to.emit(chain, "TransferRuleChanged")
        .withArgs(OrgType.Rescue, OrgType.Conservation, true);
      await chain.connect(rescue).requestTransfer(1, conservation.address, ZERO, "");
      await chain.setTransferAllowed(OrgType.Rescue, OrgType.Conservation, false);
      expect(await chain.allowedTransfer(OrgType.Rescue, OrgType.Conservation)).to.equal(false);
    });
  });

  // ------------------------------------------------------------ registry
  describe("Animal registry", () => {
    it("registers an animal with custodian, RESCUED status, evidence and timeline", async () => {
      const { chain, rescue } = await loadFixture(deployFixture);
      await expect(chain.connect(rescue).registerAnimal("Bengal Tiger", h("chip"), h("photo"), CID))
        .to.emit(chain, "AnimalRegistered")
        .withArgs(1, "Bengal Tiger", rescue.address, h("photo"), CID);
      const a = await chain.getAnimal(1);
      expect(a.id).to.equal(1);
      expect(a.species).to.equal("Bengal Tiger");
      expect(a.status).to.equal(Status.RESCUED);
      expect(a.currentCustodian).to.equal(rescue.address);
      expect(a.previousCustodian).to.equal(ethers.ZeroAddress);
      expect(a.registeredBy).to.equal(rescue.address);
      expect(a.pendingTransferTo).to.equal(ethers.ZeroAddress);
      expect(await chain.animalCount()).to.equal(1);
      expect(await chain.evidenceCount(1)).to.equal(1);
      const tl = await chain.getTimeline(1);
      expect(tl.length).to.equal(1);
      expect(tl[0].eventType).to.equal(Ev.Registered);
    });

    it("lets a ForestDepartment register but not other roles / outsiders", async () => {
      const { chain, forest, vet, rehab, conservation, outsider } = await loadFixture(deployFixture);
      await chain.connect(forest).registerAnimal("Eagle", ZERO, h("p"), CID);
      for (const s of [vet, rehab, conservation]) {
        await expect(chain.connect(s).registerAnimal("Eagle", ZERO, h("p"), CID)).to.be.revertedWithCustomError(chain, "RoleNotPermitted");
      }
      await expect(chain.connect(outsider).registerAnimal("Eagle", ZERO, h("p"), CID)).to.be.revertedWithCustomError(chain, "NotActiveOrganization");
    });

    it("rejects deactivated registrants and invalid input", async () => {
      const { chain, rescue } = await loadFixture(deployFixture);
      const c = chain.connect(rescue);
      await expect(c.registerAnimal("", ZERO, h("p"), CID)).to.be.revertedWithCustomError(chain, "EmptySpecies");
      await expect(c.registerAnimal("s".repeat(65), ZERO, h("p"), CID)).to.be.revertedWithCustomError(chain, "StringTooLong");
      await expect(c.registerAnimal("Deer", ZERO, ZERO, CID)).to.be.revertedWithCustomError(chain, "ZeroHash");
      await expect(c.registerAnimal("Deer", ZERO, h("p"), "")).to.be.revertedWithCustomError(chain, "EmptyCid");
      await expect(c.registerAnimal("Deer", ZERO, h("p"), "c".repeat(101))).to.be.revertedWithCustomError(chain, "StringTooLong");
      await chain.deactivateOrganization(rescue.address);
      await expect(c.registerAnimal("Deer", ZERO, h("p"), CID)).to.be.revertedWithCustomError(chain, "NotActiveOrganization");
    });

    it("reverts reads for unknown animals", async () => {
      const { chain } = await loadFixture(deployFixture);
      await expect(chain.getAnimal(0)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await expect(chain.getAnimal(1)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await expect(chain.getTimeline(1)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await expect(chain.getEvidence(1)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await expect(chain.getMilestones(1)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await expect(chain.getCustodyHistory(1)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await expect(chain.getPendingTransfer(1)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await expect(chain.evidenceCount(1)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await expect(chain.verifyEvidenceHash(1, ZERO)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await expect(chain.milestoneCounts(1, 0)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await expect(chain.getReleaseAuthorization(1)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await expect(chain.getReleaseRecord(1)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
    });
  });

  // -------------------------------------------------------------- custody
  describe("Two-party custody transfer", () => {
    it("request -> accept updates custody only on accept", async () => {
      const { chain, rescue, vet } = await loadFixture(registeredFixture);
      await expect(chain.connect(rescue).requestTransfer(1, vet.address, h("doc"), CID))
        .to.emit(chain, "TransferRequested")
        .withArgs(1, rescue.address, vet.address, h("doc"));
      let a = await chain.getAnimal(1);
      expect(a.currentCustodian).to.equal(rescue.address);
      expect(a.pendingTransferTo).to.equal(vet.address);
      const p = await chain.getPendingTransfer(1);
      expect(p.to).to.equal(vet.address);
      expect(p.evidenceHash).to.equal(h("doc"));

      await expect(chain.connect(vet).acceptTransfer(1)).to.emit(chain, "TransferAccepted").withArgs(1, rescue.address, vet.address);
      a = await chain.getAnimal(1);
      expect(a.currentCustodian).to.equal(vet.address);
      expect(a.previousCustodian).to.equal(rescue.address);
      expect(a.pendingTransferTo).to.equal(ethers.ZeroAddress);
      const hist = await chain.getCustodyHistory(1);
      expect(hist.length).to.equal(1);
      expect(hist[0].from).to.equal(rescue.address);
      expect(hist[0].to).to.equal(vet.address);
      expect(hist[0].evidenceHash).to.equal(h("doc"));
      expect(hist[0].acceptedAt).to.be.gte(hist[0].requestedAt);
      expect((await chain.getPendingTransfer(1)).to).to.equal(ethers.ZeroAddress);
    });

    it("cancel and reject clear the pending request without moving custody", async () => {
      const { chain, rescue, vet } = await loadFixture(registeredFixture);
      await chain.connect(rescue).requestTransfer(1, vet.address, ZERO, "");
      await expect(chain.connect(rescue).cancelTransfer(1)).to.emit(chain, "TransferCancelled").withArgs(1, rescue.address, vet.address);
      expect((await chain.getAnimal(1)).pendingTransferTo).to.equal(ethers.ZeroAddress);
      await chain.connect(rescue).requestTransfer(1, vet.address, ZERO, "");
      await expect(chain.connect(vet).rejectTransfer(1)).to.emit(chain, "TransferRejected").withArgs(1, rescue.address, vet.address);
      const a = await chain.getAnimal(1);
      expect(a.currentCustodian).to.equal(rescue.address);
      expect((await chain.getCustodyHistory(1)).length).to.equal(0);
      const kinds = (await chain.getTimeline(1)).map((e) => Number(e.eventType));
      expect(kinds).to.deep.equal([Ev.Registered, Ev.TransferRequested, Ev.TransferCancelled, Ev.TransferRequested, Ev.TransferRejected]);
    });

    it("rejects invalid requests", async () => {
      const { chain, rescue, vet, rehab, conservation, outsider } = await loadFixture(registeredFixture);
      const c = chain.connect(rescue);
      await expect(c.requestTransfer(1, rescue.address, ZERO, "")).to.be.revertedWithCustomError(chain, "InvalidRecipient");
      await expect(c.requestTransfer(1, ethers.ZeroAddress, ZERO, "")).to.be.revertedWithCustomError(chain, "InvalidRecipient");
      await expect(c.requestTransfer(1, outsider.address, ZERO, "")).to.be.revertedWithCustomError(chain, "NotActiveOrganization");
      await expect(c.requestTransfer(1, conservation.address, ZERO, "")).to.be.revertedWithCustomError(chain, "TransferNotAllowed");
      await expect(c.requestTransfer(1, vet.address, ZERO, "c".repeat(101))).to.be.revertedWithCustomError(chain, "StringTooLong");
      await chain.deactivateOrganization(vet.address);
      await expect(c.requestTransfer(1, vet.address, ZERO, "")).to.be.revertedWithCustomError(chain, "NotActiveOrganization");
      await c.requestTransfer(1, rehab.address, ZERO, "");
      await expect(c.requestTransfer(1, rehab.address, ZERO, "")).to.be.revertedWithCustomError(chain, "TransferPending");
    });

    it("only the current, active custodian may request or cancel", async () => {
      const { chain, rescue, vet, rehab, outsider } = await loadFixture(registeredFixture);
      for (const s of [vet, outsider]) {
        const err = s === outsider ? "NotActiveOrganization" : "NotCustodian";
        await expect(chain.connect(s).requestTransfer(1, rehab.address, ZERO, "")).to.be.revertedWithCustomError(chain, err);
      }
      await expect(chain.connect(rescue).requestTransfer(99, vet.address, ZERO, "")).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await chain.connect(rescue).requestTransfer(1, vet.address, ZERO, "");
      await expect(chain.connect(vet).cancelTransfer(1)).to.be.revertedWithCustomError(chain, "NotCustodian");
      await chain.connect(rescue).cancelTransfer(1);
      await expect(chain.connect(rescue).cancelTransfer(1)).to.be.revertedWithCustomError(chain, "NoPendingTransfer");
    });

    it("wrong acceptor/rejector reverts; no pending reverts; inactive recipient cannot accept", async () => {
      const { chain, rescue, vet, rehab, outsider } = await loadFixture(registeredFixture);
      await expect(chain.connect(vet).acceptTransfer(1)).to.be.revertedWithCustomError(chain, "NoPendingTransfer");
      await expect(chain.connect(vet).rejectTransfer(1)).to.be.revertedWithCustomError(chain, "NoPendingTransfer");
      await chain.connect(rescue).requestTransfer(1, vet.address, ZERO, "");
      for (const s of [rehab, outsider, rescue]) {
        await expect(chain.connect(s).acceptTransfer(1)).to.be.revertedWithCustomError(chain, "NotPendingRecipient");
        await expect(chain.connect(s).rejectTransfer(1)).to.be.revertedWithCustomError(chain, "NotPendingRecipient");
      }
      await chain.deactivateOrganization(vet.address);
      await expect(chain.connect(vet).acceptTransfer(1)).to.be.revertedWithCustomError(chain, "NotActiveOrganization");
      await expect(chain.connect(vet).rejectTransfer(1)).to.be.revertedWithCustomError(chain, "NotActiveOrganization");
      await expect(chain.connect(rescue).acceptTransfer(99)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
    });

    it("no transfer after RELEASED", async () => {
      const { chain, rescue, vet, rehab, forest } = await animalAt(5);
      await chain.connect(forest).authorizeRelease(1, h("permit"), CID);
      await chain.connect(rehab).releaseAnimal(1, "Forest edge", ZERO, "");
      await expect(chain.connect(rehab).requestTransfer(1, vet.address, ZERO, "")).to.be.revertedWithCustomError(chain, "AnimalReleased");
      void rescue;
    });
  });

  // -------------------------------------------------------------- lifecycle
  describe("Lifecycle", () => {
    it("happy path: full journey with history and timeline", async () => {
      const { chain, rescue, vet, rehab, forest, conservation } = await animalAt(5);
      expect((await chain.getAnimal(1)).status).to.equal(Status.RELEASE_READY);

      await expect(chain.connect(forest).authorizeRelease(1, h("permit"), CID))
        .to.emit(chain, "ReleaseAuthorized")
        .withArgs(1, forest.address, h("permit"), CID);
      await expect(chain.connect(rehab).releaseAnimal(1, "North ridge, sector 4", h("release-photo"), CID))
        .to.emit(chain, "AnimalReleasedEvent")
        .withArgs(1, rehab.address, "North ridge, sector 4");

      const a = await chain.getAnimal(1);
      expect(a.status).to.equal(Status.RELEASED);
      expect(a.currentCustodian).to.equal(rehab.address);
      expect(a.previousCustodian).to.equal(vet.address);

      const hist = await chain.getCustodyHistory(1);
      expect(hist.map((r) => [r.from, r.to])).to.deep.equal([
        [rescue.address, vet.address],
        [vet.address, rehab.address],
      ]);

      const tl = await chain.getTimeline(1);
      expect(tl.map((e) => Number(e.eventType))).to.deep.equal([
        Ev.Registered,
        Ev.MilestoneRecorded, // assessment
        Ev.StatusChanged, // TRIAGED
        Ev.TransferRequested,
        Ev.TransferAccepted,
        Ev.StatusChanged, // UNDER_TREATMENT
        Ev.MilestoneRecorded, // treatment
        Ev.StatusChanged, // RECOVERING
        Ev.MilestoneRecorded, // recovery
        Ev.TransferRequested,
        Ev.TransferAccepted,
        Ev.StatusChanged, // REHABILITATION
        Ev.MilestoneRecorded, // rehab
        Ev.MilestoneVerified,
        Ev.MilestoneVerified,
        Ev.StatusChanged, // RELEASE_READY
        Ev.ReleaseAuthorized,
        Ev.Released,
      ]);
      // timestamps are non-decreasing
      for (let i = 1; i < tl.length; i++) expect(tl[i].timestamp).to.be.gte(tl[i - 1].timestamp);
      expect(tl[tl.length - 1].actor).to.equal(rehab.address);

      const ms = await chain.getMilestones(1);
      expect(ms.length).to.equal(4);
      expect(ms[1].verified).to.equal(true);
      expect(ms[1].verifiedBy).to.equal(forest.address);
      expect(ms[3].verifiedBy).to.equal(conservation.address);

      const rec = await chain.getReleaseRecord(1);
      expect(rec.released).to.equal(true);
      expect(rec.locationNote).to.equal("North ridge, sector 4");
      expect((await chain.getReleaseAuthorization(1)).authorizedBy).to.equal(forest.address);
    });

    it("the authorizing ForestDepartment may also execute the release", async () => {
      const { chain, forest } = await animalAt(5);
      await chain.connect(forest).authorizeRelease(1, h("permit"), CID);
      await chain.connect(forest).releaseAnimal(1, "Reserve gate", ZERO, "");
      expect((await chain.getAnimal(1)).status).to.equal(Status.RELEASED);
    });

    it("every invalid transition reverts", async () => {
      const { chain, rescue } = await registeredFixture();
      const c = chain.connect(rescue);
      await expect(c.advanceStatus(1, Status.RELEASED)).to.be.revertedWithCustomError(chain, "InvalidTransition");
      await expect(c.advanceStatus(1, Status.UNDER_TREATMENT)).to.be.revertedWithCustomError(chain, "InvalidTransition");
      await expect(c.advanceStatus(1, Status.RESCUED)).to.be.revertedWithCustomError(chain, "InvalidTransition");
      await expect(c.advanceStatus(1, Status.RELEASE_READY)).to.be.revertedWithCustomError(chain, "InvalidTransition");
      await expect(c.advanceStatus(1, Status.RECOVERING)).to.be.revertedWithCustomError(chain, "InvalidTransition");
    });

    it("cannot go backwards, skip, or advance RELEASE_READY -> RELEASED", async () => {
      const { chain, rehab, vet } = await animalAt(3); // RECOVERING under vet
      await expect(chain.connect(vet).advanceStatus(1, Status.UNDER_TREATMENT)).to.be.revertedWithCustomError(chain, "InvalidTransition");
      await expect(chain.connect(vet).advanceStatus(1, Status.RELEASE_READY)).to.be.revertedWithCustomError(chain, "InvalidTransition");
      const f = await animalAt(5);
      await expect(f.chain.connect(f.rehab).advanceStatus(1, Status.RELEASED)).to.be.revertedWithCustomError(f.chain, "InvalidTransition");
      await expect(f.chain.connect(f.rehab).advanceStatus(1, Status.REHABILITATION)).to.be.revertedWithCustomError(f.chain, "InvalidTransition");
      void rehab;
    });

    it("advancing during a pending transfer reverts", async () => {
      const { chain, rescue, vet } = await registeredFixture();
      await chain.connect(rescue).recordMilestone(1, MType.ASSESSMENT, "n", ZERO, "");
      await chain.connect(rescue).requestTransfer(1, vet.address, ZERO, "");
      await expect(chain.connect(rescue).advanceStatus(1, Status.TRIAGED)).to.be.revertedWithCustomError(chain, "TransferPending");
    });

    it("enforces milestone preconditions on each transition", async () => {
      const { chain, rescue, vet, rehab, forest } = await registeredFixture();
      await expect(chain.connect(rescue).advanceStatus(1, Status.TRIAGED)).to.be.revertedWithCustomError(chain, "MissingMilestone");
      await chain.connect(rescue).recordMilestone(1, MType.ASSESSMENT, "n", ZERO, "");
      await chain.connect(rescue).advanceStatus(1, Status.TRIAGED);
      await chain.connect(rescue).requestTransfer(1, vet.address, ZERO, "");
      await chain.connect(vet).acceptTransfer(1);
      await chain.connect(vet).advanceStatus(1, Status.UNDER_TREATMENT);
      await expect(chain.connect(vet).advanceStatus(1, Status.RECOVERING)).to.be.revertedWithCustomError(chain, "MissingMilestone");
      await chain.connect(vet).recordMilestone(1, MType.TREATMENT, "n", ZERO, "");
      await chain.connect(vet).advanceStatus(1, Status.RECOVERING);
      await expect(chain.connect(vet).advanceStatus(1, Status.REHABILITATION)).to.be.revertedWithCustomError(chain, "MissingMilestone");
      await chain.connect(vet).recordMilestone(1, MType.RECOVERY, "n", ZERO, "");
      await chain.connect(vet).advanceStatus(1, Status.REHABILITATION); // vet is allowed here
      await chain.connect(vet).requestTransfer(1, rehab.address, ZERO, "");
      await chain.connect(rehab).acceptTransfer(1);
      await expect(chain.connect(rehab).advanceStatus(1, Status.RELEASE_READY)).to.be.revertedWithCustomError(chain, "MissingVerifiedMilestone");
      await chain.connect(rehab).recordMilestone(1, MType.REHABILITATION, "n", ZERO, "");
      // unverified milestones are not enough
      await expect(chain.connect(rehab).advanceStatus(1, Status.RELEASE_READY)).to.be.revertedWithCustomError(chain, "MissingVerifiedMilestone");
      await chain.connect(forest).verifyMilestone(1, 1); // TREATMENT only
      await expect(chain.connect(rehab).advanceStatus(1, Status.RELEASE_READY)).to.be.revertedWithCustomError(chain, "MissingVerifiedMilestone");
      await chain.connect(forest).verifyMilestone(1, 3);
      await chain.connect(rehab).advanceStatus(1, Status.RELEASE_READY);
    });

    it("enforces the role for each transition", async () => {
      const { chain, rescue, vet, rehab } = await registeredFixture();
      await chain.connect(rescue).recordMilestone(1, MType.ASSESSMENT, "n", ZERO, "");
      await chain.connect(rescue).advanceStatus(1, Status.TRIAGED);
      // TRIAGED -> UNDER_TREATMENT: Vet only, so RescueTeam custodian is refused
      await expect(chain.connect(rescue).advanceStatus(1, Status.UNDER_TREATMENT)).to.be.revertedWithCustomError(chain, "RoleNotPermitted");
      // hand to rehab (allowed pair) - rehab may not run RESCUED..UNDER_TREATMENT steps
      await chain.connect(rescue).requestTransfer(1, rehab.address, ZERO, "");
      await chain.connect(rehab).acceptTransfer(1);
      await expect(chain.connect(rehab).advanceStatus(1, Status.UNDER_TREATMENT)).to.be.revertedWithCustomError(chain, "RoleNotPermitted");
      void vet;
    });

    it("RESCUED -> TRIAGED role check, UNDER_TREATMENT role check, REHABILITATION -> RELEASE_READY role check", async () => {
      const { chain, forest, rescue, vet, conservation } = await registeredFixture();
      await chain.connect(rescue).recordMilestone(1, MType.ASSESSMENT, "n", ZERO, "");
      await chain.setTransferAllowed(OrgType.Rescue, OrgType.Conservation, true);
      await chain.connect(rescue).requestTransfer(1, conservation.address, ZERO, "");
      await chain.connect(conservation).acceptTransfer(1);
      await expect(chain.connect(conservation).advanceStatus(1, Status.TRIAGED)).to.be.revertedWithCustomError(chain, "RoleNotPermitted");
      void forest; void vet;
      const f = await animalAt(4); // REHABILITATION at rehab; verify by forest
      await f.chain.connect(f.rehab).recordMilestone(1, MType.REHABILITATION, "n", ZERO, "");
      await f.chain.connect(f.forest).verifyMilestone(1, 1);
      await f.chain.connect(f.forest).verifyMilestone(1, 3);
      await f.chain.connect(f.rehab).requestTransfer(1, f.vet.address, ZERO, "");
      await f.chain.connect(f.vet).acceptTransfer(1);
      await expect(f.chain.connect(f.vet).advanceStatus(1, Status.RELEASE_READY)).to.be.revertedWithCustomError(f.chain, "RoleNotPermitted");
    });

    it("advanceStatus: non-custodian, outsider, deactivated, unknown animal", async () => {
      const { chain, rescue, vet, outsider } = await registeredFixture();
      await expect(chain.connect(vet).advanceStatus(1, Status.TRIAGED)).to.be.revertedWithCustomError(chain, "NotCustodian");
      await expect(chain.connect(outsider).advanceStatus(1, Status.TRIAGED)).to.be.revertedWithCustomError(chain, "NotActiveOrganization");
      await expect(chain.connect(rescue).advanceStatus(7, Status.TRIAGED)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await chain.deactivateOrganization(rescue.address);
      await expect(chain.connect(rescue).advanceStatus(1, Status.TRIAGED)).to.be.revertedWithCustomError(chain, "NotActiveOrganization");
    });

    it("RELEASED is terminal: no further changes", async () => {
      const { chain, rehab, forest, vet } = await animalAt(5);
      await chain.connect(forest).authorizeRelease(1, h("permit"), CID);
      await chain.connect(rehab).releaseAnimal(1, "Forest edge", ZERO, "");
      await expect(chain.connect(rehab).recordMilestone(1, MType.REHABILITATION, "n", ZERO, "")).to.be.revertedWithCustomError(chain, "AnimalReleased");
      await expect(chain.connect(rehab).addEvidence(1, "X", h("x"), CID)).to.be.revertedWithCustomError(chain, "AnimalReleased");
      await expect(chain.connect(vet).verifyMilestone(1, 0)).to.be.revertedWithCustomError(chain, "AnimalReleased");
      await expect(chain.connect(rehab).advanceStatus(1, Status.RELEASED)).to.be.revertedWithCustomError(chain, "InvalidTransition");
      await expect(chain.connect(rehab).releaseAnimal(1, "again", ZERO, "")).to.be.revertedWithCustomError(chain, "NotReleaseReady");
    });
  });

  // ------------------------------------------------------------ milestones
  describe("Milestones and verification", () => {
    it("records a milestone with event and evidence", async () => {
      const { chain, rescue } = await loadFixture(registeredFixture);
      await expect(chain.connect(rescue).recordMilestone(1, MType.ASSESSMENT, "Dehydrated, alert", h("m1"), CID))
        .to.emit(chain, "MilestoneRecorded")
        .withArgs(1, 0, MType.ASSESSMENT, rescue.address);
      const [m] = await chain.getMilestones(1);
      expect(m.note).to.equal("Dehydrated, alert");
      expect(m.recordedBy).to.equal(rescue.address);
      expect(m.verified).to.equal(false);
      expect(await chain.evidenceCount(1)).to.equal(2);
      const counts = await chain.milestoneCounts(1, MType.ASSESSMENT);
      expect(counts.recorded).to.equal(1);
      expect(counts.verified).to.equal(0);
    });

    it("milestone role rules per type", async () => {
      const f = await animalAt(4); // rehab is custodian
      await expect(f.chain.connect(f.rehab).recordMilestone(1, MType.TREATMENT, "n", ZERO, "")).to.be.revertedWithCustomError(f.chain, "RoleNotPermitted");
      await expect(f.chain.connect(f.rehab).recordMilestone(1, MType.RECOVERY, "n", ZERO, "")).to.be.revertedWithCustomError(f.chain, "RoleNotPermitted");
      await expect(f.chain.connect(f.rehab).recordMilestone(1, MType.ASSESSMENT, "n", ZERO, "")).to.be.revertedWithCustomError(f.chain, "RoleNotPermitted");
      await f.chain.connect(f.rehab).recordMilestone(1, MType.REHABILITATION, "n", ZERO, "");
      const g = await registeredFixture(); // rescue team custodian
      await expect(g.chain.connect(g.rescue).recordMilestone(1, MType.TREATMENT, "n", ZERO, "")).to.be.revertedWithCustomError(g.chain, "RoleNotPermitted");
      await expect(g.chain.connect(g.rescue).recordMilestone(1, MType.REHABILITATION, "n", ZERO, "")).to.be.revertedWithCustomError(g.chain, "RoleNotPermitted");
    });

    it("vet custodian may record an assessment", async () => {
      const { chain, rescue, vet } = await registeredFixture();
      await chain.connect(rescue).requestTransfer(1, vet.address, ZERO, "");
      await chain.connect(vet).acceptTransfer(1);
      await chain.connect(vet).recordMilestone(1, MType.ASSESSMENT, "Second opinion", ZERO, "");
    });

    it("only the active custodian records; validates note and cid", async () => {
      const { chain, rescue, vet, outsider } = await registeredFixture();
      await expect(chain.connect(vet).recordMilestone(1, MType.ASSESSMENT, "n", ZERO, "")).to.be.revertedWithCustomError(chain, "NotCustodian");
      await expect(chain.connect(outsider).recordMilestone(1, MType.ASSESSMENT, "n", ZERO, "")).to.be.revertedWithCustomError(chain, "NotActiveOrganization");
      await expect(chain.connect(rescue).recordMilestone(1, MType.ASSESSMENT, "", ZERO, "")).to.be.revertedWithCustomError(chain, "EmptyNote");
      await expect(chain.connect(rescue).recordMilestone(1, MType.ASSESSMENT, "n".repeat(281), ZERO, "")).to.be.revertedWithCustomError(chain, "StringTooLong");
      await expect(chain.connect(rescue).recordMilestone(1, MType.ASSESSMENT, "n", ZERO, "c".repeat(101))).to.be.revertedWithCustomError(chain, "StringTooLong");
    });

    it("verification: different org only, once only, must exist", async () => {
      const { chain, rescue, vet, outsider, forest } = await registeredFixture();
      await chain.connect(rescue).recordMilestone(1, MType.ASSESSMENT, "n", ZERO, "");
      await expect(chain.connect(rescue).verifyMilestone(1, 0)).to.be.revertedWithCustomError(chain, "SelfVerification");
      await expect(chain.connect(outsider).verifyMilestone(1, 0)).to.be.revertedWithCustomError(chain, "NotActiveOrganization");
      await expect(chain.connect(vet).verifyMilestone(1, 5)).to.be.revertedWithCustomError(chain, "MilestoneNotFound");
      await expect(chain.connect(vet).verifyMilestone(9, 0)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await expect(chain.connect(forest).verifyMilestone(1, 0)).to.emit(chain, "MilestoneVerified").withArgs(1, 0, forest.address);
      await expect(chain.connect(vet).verifyMilestone(1, 0)).to.be.revertedWithCustomError(chain, "AlreadyVerified");
      const counts = await chain.milestoneCounts(1, MType.ASSESSMENT);
      expect(counts.verified).to.equal(1);
    });
  });

  // --------------------------------------------------------------- release
  describe("Release authorization", () => {
    it("only an active ForestDepartment authorizes, only at RELEASE_READY, once", async () => {
      const { chain, rehab, forest, conservation, outsider } = await animalAt(5);
      await expect(chain.connect(rehab).authorizeRelease(1, h("p"), CID)).to.be.revertedWithCustomError(chain, "RoleNotPermitted");
      await expect(chain.connect(conservation).authorizeRelease(1, h("p"), CID)).to.be.revertedWithCustomError(chain, "RoleNotPermitted");
      await expect(chain.connect(outsider).authorizeRelease(1, h("p"), CID)).to.be.revertedWithCustomError(chain, "NotActiveOrganization");
      await expect(chain.connect(forest).authorizeRelease(1, ZERO, CID)).to.be.revertedWithCustomError(chain, "ZeroHash");
      await expect(chain.connect(forest).authorizeRelease(1, h("p"), "c".repeat(101))).to.be.revertedWithCustomError(chain, "StringTooLong");
      await chain.connect(forest).authorizeRelease(1, h("p"), CID);
      await expect(chain.connect(forest).authorizeRelease(1, h("p"), CID)).to.be.revertedWithCustomError(chain, "AlreadyAuthorized");
      await expect(chain.connect(forest).authorizeRelease(42, h("p"), CID)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
    });

    it("cannot authorize before RELEASE_READY", async () => {
      const { chain, forest } = await animalAt(4);
      await expect(chain.connect(forest).authorizeRelease(1, h("p"), CID)).to.be.revertedWithCustomError(chain, "NotReleaseReady");
    });

    it("release requires authorization, status, custodian/authorizer and no pending transfer", async () => {
      const { chain, rehab, vet, forest, conservation, outsider } = await animalAt(5);
      await expect(chain.connect(rehab).releaseAnimal(1, "loc", ZERO, "")).to.be.revertedWithCustomError(chain, "ReleaseNotAuthorized");
      await chain.connect(forest).authorizeRelease(1, h("p"), CID);
      await expect(chain.connect(vet).releaseAnimal(1, "loc", ZERO, "")).to.be.revertedWithCustomError(chain, "NotAuthorizedToRelease");
      await expect(chain.connect(conservation).releaseAnimal(1, "loc", ZERO, "")).to.be.revertedWithCustomError(chain, "NotAuthorizedToRelease");
      await expect(chain.connect(outsider).releaseAnimal(1, "loc", ZERO, "")).to.be.revertedWithCustomError(chain, "NotActiveOrganization");
      await expect(chain.connect(rehab).releaseAnimal(1, "", ZERO, "")).to.be.revertedWithCustomError(chain, "EmptyNote");
      await expect(chain.connect(rehab).releaseAnimal(1, "n".repeat(281), ZERO, "")).to.be.revertedWithCustomError(chain, "StringTooLong");
      await expect(chain.connect(rehab).releaseAnimal(1, "loc", ZERO, "c".repeat(101))).to.be.revertedWithCustomError(chain, "StringTooLong");
      await chain.connect(rehab).requestTransfer(1, vet.address, ZERO, "");
      await expect(chain.connect(rehab).releaseAnimal(1, "loc", ZERO, "")).to.be.revertedWithCustomError(chain, "TransferPending");
      await chain.connect(rehab).cancelTransfer(1);
      await expect(chain.connect(rehab).releaseAnimal(77, "loc", ZERO, "")).to.be.revertedWithCustomError(chain, "AnimalNotFound");
      await chain.connect(rehab).releaseAnimal(1, "loc", ZERO, "");
    });

    it("cannot release an animal that is not RELEASE_READY", async () => {
      const { chain, rehab } = await animalAt(4);
      await expect(chain.connect(rehab).releaseAnimal(1, "loc", ZERO, "")).to.be.revertedWithCustomError(chain, "NotReleaseReady");
    });
  });

  // -------------------------------------------------------------- evidence
  describe("Evidence", () => {
    it("adds, finds and detects modified files", async () => {
      const { chain, rescue } = await loadFixture(registeredFixture);
      const report = h("medical-report-v1");
      await expect(chain.connect(rescue).addEvidence(1, "MEDICAL_REPORT", report, CID))
        .to.emit(chain, "EvidenceAdded")
        .withArgs(1, 1, "MEDICAL_REPORT", report, CID, rescue.address);
      const [found, index] = await chain.verifyEvidenceHash(1, report);
      expect(found).to.equal(true);
      expect(index).to.equal(1);
      const [foundOrig, idx0] = await chain.verifyEvidenceHash(1, h("rescue-photo"));
      expect(foundOrig).to.equal(true);
      expect(idx0).to.equal(0);
      const [foundBad] = await chain.verifyEvidenceHash(1, h("medical-report-v1 (edited)"));
      expect(foundBad).to.equal(false);
      const ev = await chain.getEvidence(1);
      expect(ev[1].uploadedBy).to.equal(rescue.address);
      expect(ev[1].evidenceType).to.equal("MEDICAL_REPORT");
      const tl = await chain.getTimeline(1);
      expect(Number(tl[tl.length - 1].eventType)).to.equal(Ev.EvidenceAdded);
    });

    it("any active previous custodian may still add evidence; strangers may not", async () => {
      const { chain, rescue, vet, rehab, outsider } = await loadFixture(registeredFixture);
      await chain.connect(rescue).requestTransfer(1, vet.address, ZERO, "");
      await chain.connect(vet).acceptTransfer(1);
      await chain.connect(rescue).addEvidence(1, "FOLLOW_UP", h("f"), CID); // former custodian
      await chain.connect(vet).addEvidence(1, "LAB", h("l"), CID);
      await expect(chain.connect(rehab).addEvidence(1, "X", h("x"), CID)).to.be.revertedWithCustomError(chain, "NotEvidenceContributor");
      await expect(chain.connect(outsider).addEvidence(1, "X", h("x"), CID)).to.be.revertedWithCustomError(chain, "NotActiveOrganization");
      await chain.deactivateOrganization(rescue.address);
      await expect(chain.connect(rescue).addEvidence(1, "X", h("x"), CID)).to.be.revertedWithCustomError(chain, "NotActiveOrganization");
    });

    it("validates evidence input", async () => {
      const { chain, rescue } = await loadFixture(registeredFixture);
      const c = chain.connect(rescue);
      await expect(c.addEvidence(1, "", h("x"), CID)).to.be.revertedWithCustomError(chain, "EmptyNote");
      await expect(c.addEvidence(1, "T".repeat(33), h("x"), CID)).to.be.revertedWithCustomError(chain, "StringTooLong");
      await expect(c.addEvidence(1, "T", ZERO, CID)).to.be.revertedWithCustomError(chain, "ZeroHash");
      await expect(c.addEvidence(1, "T", h("x"), "")).to.be.revertedWithCustomError(chain, "EmptyCid");
      await expect(c.addEvidence(1, "T", h("x"), "c".repeat(101))).to.be.revertedWithCustomError(chain, "StringTooLong");
      await expect(c.addEvidence(5, "T", h("x"), CID)).to.be.revertedWithCustomError(chain, "AnimalNotFound");
    });

    it("transfer, milestone and release evidence are also verifiable", async () => {
      const { chain, rehab } = await animalAt(5);
      expect((await chain.verifyEvidenceHash(1, h("handover")))[0]).to.equal(true);
      expect((await chain.verifyEvidenceHash(1, h("treat")))[0]).to.equal(true);
      expect((await chain.verifyEvidenceHash(1, h("rehab")))[0]).to.equal(true);
      void rehab;
    });
  });

  // ----------------------------------------------------------- timestamps
  it("timeline timestamps follow block time", async () => {
    const { chain, rescue, vet } = await loadFixture(registeredFixture);
    await time.increase(1000);
    await chain.connect(rescue).requestTransfer(1, vet.address, ZERO, "");
    const tl = await chain.getTimeline(1);
    expect(Number(tl[1].timestamp) - Number(tl[0].timestamp)).to.be.gte(1000);
  });
});
