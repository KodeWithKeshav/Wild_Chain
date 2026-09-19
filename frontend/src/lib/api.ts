import type { Contract } from "ethers";
import type { Animal, AnimalDetail, Org } from "./chain";

const n = (v: bigint | number) => Number(v);

export const toOrg = (address: string, o: any): Org => ({ address, name: o.name, orgType: n(o.orgType), active: o.active, registered: o.registered });
export const toAnimal = (a: any): Animal => ({
  id: n(a.id), species: a.species, identityHash: a.identityHash, status: n(a.status), currentCustodian: a.currentCustodian,
  previousCustodian: a.previousCustodian, registeredBy: a.registeredBy, registeredAt: n(a.registeredAt), pendingTransferTo: a.pendingTransferTo,
});

export async function fetchOrgs(c: Contract): Promise<Org[]> {
  const count = n(await c.organizationCount());
  const addrs: string[] = await Promise.all(Array.from({ length: count }, (_, i) => c.organizationAt(i)));
  return Promise.all(addrs.map(async (a) => toOrg(a, await c.getOrganization(a))));
}

export async function fetchAnimals(c: Contract): Promise<Animal[]> {
  const count = n(await c.animalCount());
  return Promise.all(Array.from({ length: count }, async (_, i) => toAnimal(await c.getAnimal(i + 1))));
}

export async function fetchAnimalDetail(c: Contract, id: number): Promise<AnimalDetail> {
  const [animal, milestones, history, evidence, timeline, pending, releaseAuth, releaseRecord] = await Promise.all([
    c.getAnimal(id), c.getMilestones(id), c.getCustodyHistory(id), c.getEvidence(id), c.getTimeline(id),
    c.getPendingTransfer(id), c.getReleaseAuthorization(id), c.getReleaseRecord(id),
  ]);
  return {
    animal: toAnimal(animal),
    milestones: milestones.map((m: any, index: number) => ({
      index, type: n(m.milestoneType), recordedBy: m.recordedBy, recordedAt: n(m.recordedAt), note: m.note, evidenceHash: m.evidenceHash,
      cid: m.cid, verified: m.verified, verifiedBy: m.verifiedBy, verifiedAt: n(m.verifiedAt),
    })),
    history: history.map((r: any) => ({ from: r.from, to: r.to, requestedAt: n(r.requestedAt), acceptedAt: n(r.acceptedAt), evidenceHash: r.evidenceHash })),
    evidence: evidence.map((e: any, index: number) => ({ index, type: e.evidenceType, hash: e.hash, cid: e.cid, uploadedBy: e.uploadedBy, uploadedAt: n(e.uploadedAt) })),
    timeline: timeline.map((t: any) => ({ eventType: n(t.eventType), actor: t.actor, timestamp: n(t.timestamp), refIndex: n(t.refIndex) })),
    pending: { to: pending.to, requestedAt: n(pending.requestedAt), evidenceHash: pending.evidenceHash },
    releaseAuth: { authorized: releaseAuth.authorized, authorizedBy: releaseAuth.authorizedBy, authorizedAt: n(releaseAuth.authorizedAt), permitHash: releaseAuth.permitHash, permitCid: releaseAuth.permitCid },
    releaseRecord: { released: releaseRecord.released, releasedBy: releaseRecord.releasedBy, releasedAt: n(releaseRecord.releasedAt), locationNote: releaseRecord.locationNote, evidenceHash: releaseRecord.evidenceHash, cid: releaseRecord.cid },
  };
}
