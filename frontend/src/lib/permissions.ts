import { MType, OrgType, Status, MILESTONE_TYPES, type Animal, type Milestone, type Org } from "./chain";
import { isZeroAddr, sameAddr } from "./format";

export interface Verdict { ok: boolean; reason?: string }
const yes: Verdict = { ok: true };
const no = (reason: string): Verdict => ({ ok: false, reason });

export const isActive = (org: Org | null) => !!org && org.registered && org.active;
export const isCustodian = (a: Animal, account: string | null) => sameAddr(a.currentCustodian, account);
const released = (a: Animal) => a.status === Status.RELEASED;
const hasPending = (a: Animal) => !isZeroAddr(a.pendingTransferTo);

export function canRegister(org: Org | null): Verdict {
  if (!isActive(org)) return no("Connect a registered, active organization wallet.");
  return org!.orgType === OrgType.Rescue || org!.orgType === OrgType.Forest ? yes : no("Only Rescue Teams and Forest Departments can register animals.");
}

/** Milestone types a given org type may record. */
export function milestoneTypesFor(orgType: number): number[] {
  if (orgType === OrgType.Vet) return [MType.ASSESSMENT, MType.TREATMENT, MType.RECOVERY];
  if (orgType === OrgType.Rescue) return [MType.ASSESSMENT];
  if (orgType === OrgType.Rehab) return [MType.REHABILITATION];
  return [];
}

export function canRecordMilestone(a: Animal, org: Org | null, account: string | null): Verdict {
  if (!isActive(org)) return no("Connect a registered, active organization wallet.");
  if (released(a)) return no("Animal is released; record is final.");
  if (!isCustodian(a, account)) return no("Only the current custodian can record milestones.");
  if (milestoneTypesFor(org!.orgType).length === 0) return no("Your organization type cannot record milestones.");
  return yes;
}

export function canVerify(m: Milestone, a: Animal, org: Org | null, account: string | null): Verdict {
  if (!isActive(org)) return no("Connect a registered, active organization wallet.");
  if (released(a)) return no("Animal is released; record is final.");
  if (m.verified) return no("Already verified.");
  if (sameAddr(m.recordedBy, account)) return no("You cannot verify your own milestone.");
  return yes;
}

/** Can the connected wallet advance the animal to its next status, and if not, why not. */
export function canAdvance(a: Animal, ms: Milestone[], org: Org | null, account: string | null): Verdict & { next?: number } {
  if (a.status >= Status.RELEASE_READY) return { ...no(a.status === Status.RELEASED ? "Animal is released." : "Use the Release page to finish."), next: undefined };
  const next = a.status + 1;
  if (!isActive(org)) return { ...no("Connect a registered, active organization wallet."), next };
  if (!isCustodian(a, account)) return { ...no("Only the current custodian can advance the status."), next };
  if (hasPending(a)) return { ...no("A custody transfer is pending."), next };
  const t = org!.orgType;
  const rec = (type: number) => ms.some((m) => m.type === type);
  const ver = (type: number) => ms.some((m) => m.type === type && m.verified);
  const role = (...allowed: number[]) => allowed.includes(t);
  const roleErr = (names: string) => ({ ...no(`Requires ${names} custody.`), next });
  switch (a.status) {
    case Status.RESCUED:
      if (!role(OrgType.Rescue, OrgType.Vet)) return roleErr("Rescue Team or Veterinary Hospital");
      if (!rec(MType.ASSESSMENT)) return { ...no("Record an Assessment milestone first."), next };
      break;
    case Status.TRIAGED:
      if (!role(OrgType.Vet)) return roleErr("Veterinary Hospital");
      break;
    case Status.UNDER_TREATMENT:
      if (!role(OrgType.Vet)) return roleErr("Veterinary Hospital");
      if (!rec(MType.TREATMENT)) return { ...no("Record a Treatment milestone first."), next };
      break;
    case Status.RECOVERING:
      if (!role(OrgType.Vet, OrgType.Rehab)) return roleErr("Veterinary Hospital or Rehabilitation Centre");
      if (!rec(MType.RECOVERY)) return { ...no("Record a Recovery milestone first."), next };
      break;
    case Status.REHABILITATION:
      if (!role(OrgType.Rehab)) return roleErr("Rehabilitation Centre");
      if (!ver(MType.TREATMENT)) return { ...no(`A verified ${MILESTONE_TYPES[MType.TREATMENT]} milestone is required.`), next };
      if (!ver(MType.REHABILITATION)) return { ...no(`A verified ${MILESTONE_TYPES[MType.REHABILITATION]} milestone is required.`), next };
      break;
  }
  return { ...yes, next };
}

export function canRequestTransfer(a: Animal, org: Org | null, account: string | null): Verdict {
  if (!isActive(org)) return no("Connect a registered, active organization wallet.");
  if (released(a)) return no("Animal is released.");
  if (!isCustodian(a, account)) return no("Only the current custodian can request a transfer.");
  if (hasPending(a)) return no("A transfer is already pending.");
  return yes;
}

export function canAuthorizeRelease(a: Animal, org: Org | null, authorized: boolean): Verdict {
  if (!isActive(org)) return no("Connect a registered, active organization wallet.");
  if (org!.orgType !== OrgType.Forest) return no("Only a Forest Department can authorize release.");
  if (a.status !== Status.RELEASE_READY) return no("Animal must be Release ready.");
  if (authorized) return no("Release is already authorized.");
  return yes;
}

export function canRelease(a: Animal, org: Org | null, account: string | null, authorized: boolean, authorizedBy: string): Verdict {
  if (!isActive(org)) return no("Connect a registered, active organization wallet.");
  if (a.status !== Status.RELEASE_READY) return no("Animal must be Release ready.");
  if (!authorized) return no("Waiting for a Forest Department to authorize release.");
  if (hasPending(a)) return no("A custody transfer is pending.");
  if (!isCustodian(a, account) && !sameAddr(authorizedBy, account)) return no("Only the custodian or the authorizing Forest Department can release.");
  return yes;
}

export function canAddEvidence(a: Animal, org: Org | null, wasCustodian: boolean): Verdict {
  if (!isActive(org)) return no("Connect a registered, active organization wallet.");
  if (released(a)) return no("Animal is released; record is final.");
  if (!wasCustodian) return no("Only organizations that have held custody can add evidence.");
  return yes;
}
