import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

export const OrgType = { Rescue: 0, Vet: 1, Rehab: 2, Forest: 3, Conservation: 4 } as const;
export const Status = {
  RESCUED: 0,
  TRIAGED: 1,
  UNDER_TREATMENT: 2,
  RECOVERING: 3,
  REHABILITATION: 4,
  RELEASE_READY: 5,
  RELEASED: 6,
} as const;
export const MType = { ASSESSMENT: 0, TREATMENT: 1, RECOVERY: 2, REHABILITATION: 3 } as const;
export const Ev = {
  Registered: 0,
  TransferRequested: 1,
  TransferAccepted: 2,
  TransferCancelled: 3,
  TransferRejected: 4,
  MilestoneRecorded: 5,
  MilestoneVerified: 6,
  StatusChanged: 7,
  EvidenceAdded: 8,
  ReleaseAuthorized: 9,
  Released: 10,
} as const;

export const h = (s: string) => ethers.sha256(ethers.toUtf8Bytes(s));
export const ZERO = ethers.ZeroHash;
export const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

export async function deployFixture() {
  const [owner, rescue, vet, rehab, forest, conservation, outsider, vet2, extra] = await ethers.getSigners();
  const chain = await (await ethers.getContractFactory("WildlifeChainOfCustody")).deploy();
  await chain.waitForDeployment();
  await chain.registerOrganization(rescue.address, "Coastal Rescue Team", OrgType.Rescue);
  await chain.registerOrganization(vet.address, "City Veterinary Hospital", OrgType.Vet);
  await chain.registerOrganization(rehab.address, "Green Valley Rehab", OrgType.Rehab);
  await chain.registerOrganization(forest.address, "State Forest Department", OrgType.Forest);
  await chain.registerOrganization(conservation.address, "Wildlife Trust", OrgType.Conservation);
  await chain.registerOrganization(vet2.address, "Second Vet Clinic", OrgType.Vet);
  return { chain, owner, rescue, vet, rehab, forest, conservation, outsider, vet2, extra };
}

export async function registeredFixture() {
  const f = await deployFixture();
  await f.chain.connect(f.rescue).registerAnimal("Spotted Deer", h("tag-1"), h("rescue-photo"), CID);
  return f;
}

/** Register (id 1) and take the animal to a given status through the legal path. */
export async function animalAt(target: number) {
  const f = await registeredFixture();
  const { chain, rescue, vet, rehab, forest, conservation } = f;
  const steps: Array<() => Promise<unknown>> = [
    // -> TRIAGED
    async () => {
      await chain.connect(rescue).recordMilestone(1, MType.ASSESSMENT, "Initial assessment", h("a"), CID);
      await chain.connect(rescue).advanceStatus(1, Status.TRIAGED);
      await chain.connect(rescue).requestTransfer(1, vet.address, h("handover"), CID);
      await chain.connect(vet).acceptTransfer(1);
    },
    // -> UNDER_TREATMENT
    async () => chain.connect(vet).advanceStatus(1, Status.UNDER_TREATMENT),
    // -> RECOVERING
    async () => {
      await chain.connect(vet).recordMilestone(1, MType.TREATMENT, "Fracture set", h("treat"), CID);
      await chain.connect(vet).advanceStatus(1, Status.RECOVERING);
    },
    // -> REHABILITATION
    async () => {
      await chain.connect(vet).recordMilestone(1, MType.RECOVERY, "Walking unaided", h("recovery"), CID);
      await chain.connect(vet).requestTransfer(1, rehab.address, ZERO, "");
      await chain.connect(rehab).acceptTransfer(1);
      await chain.connect(rehab).advanceStatus(1, Status.REHABILITATION);
    },
    // -> RELEASE_READY
    async () => {
      await chain.connect(rehab).recordMilestone(1, MType.REHABILITATION, "Hunting behaviour restored", h("rehab"), CID);
      await chain.connect(forest).verifyMilestone(1, 1); // TREATMENT (recorded by vet)
      await chain.connect(conservation).verifyMilestone(1, 3); // REHABILITATION
      await chain.connect(rehab).advanceStatus(1, Status.RELEASE_READY);
    },
  ];
  for (let i = 0; i < Math.min(target, 5); i++) await steps[i]();
  return f;
}
