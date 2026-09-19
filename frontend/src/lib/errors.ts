import { Interface } from "ethers";
import { ORG_TYPES, STATUSES, MILESTONE_TYPES } from "./chain";

const MESSAGES: Record<string, (a: any[]) => string> = {
  OwnableUnauthorizedAccount: () => "Only the contract owner (admin) can do this.",
  NotActiveOrganization: () => "This wallet is not a registered, active organization.",
  InvalidAddress: () => "Invalid address.",
  EmptyName: () => "Name cannot be empty.",
  StringTooLong: (a) => `Text is too long (max ${a[0]} bytes).`,
  AlreadyRegistered: () => "This address is already registered.",
  NotRegistered: () => "This address is not a registered organization.",
  AlreadyActive: () => "Organization is already active.",
  AlreadyInactive: () => "Organization is already inactive.",
  WrongOrganizationType: () => "Wrong organization type for this action.",
  AnimalNotFound: (a) => `Animal #${a[0]} does not exist.`,
  EmptySpecies: () => "Species is required.",
  ZeroHash: () => "A file hash is required.",
  EmptyCid: () => "An IPFS CID is required.",
  NotCustodian: () => "Only the animal's current custodian can do this.",
  AnimalReleased: () => "This animal has been released; its record is final.",
  TransferPending: () => "A custody transfer is pending. Resolve it first.",
  RoleNotPermitted: (a) => `A ${ORG_TYPES[Number(a[0])] ?? "this type of organization"} is not permitted to do this.`,
  InvalidRecipient: () => "Invalid recipient.",
  TransferNotAllowed: (a) => `Custody cannot pass from ${ORG_TYPES[Number(a[0])]} to ${ORG_TYPES[Number(a[1])]}.`,
  NoPendingTransfer: () => "There is no pending transfer.",
  NotPendingRecipient: () => "Only the intended recipient can do this.",
  MilestoneNotFound: () => "Milestone not found.",
  AlreadyVerified: () => "Milestone is already verified.",
  SelfVerification: () => "You cannot verify a milestone you recorded yourself.",
  InvalidTransition: (a) => `Invalid transition ${STATUSES[Number(a[0])]} → ${STATUSES[Number(a[1])]}. Status only moves forward, one step at a time.`,
  MissingMilestone: (a) => `A ${MILESTONE_TYPES[Number(a[0])]} milestone must be recorded first.`,
  MissingVerifiedMilestone: (a) => `A verified ${MILESTONE_TYPES[Number(a[0])]} milestone is required first.`,
  NotReleaseReady: () => "The animal must be in Release ready status.",
  ReleaseNotAuthorized: () => "A Forest Department must authorize the release first.",
  AlreadyAuthorized: () => "Release is already authorized.",
  NotAuthorizedToRelease: () => "Only the custodian or the authorizing Forest Department can release.",
  NotEvidenceContributor: () => "Only organizations that have held custody can add evidence.",
  EmptyNote: () => "Text field cannot be empty.",
};

let iface: Interface | null = null;
export function setInterface(i: Interface) { iface = i; }

function findData(err: any, depth = 0): string | null {
  if (!err || depth > 5) return null;
  for (const v of [err.data, err.error?.data, err.info?.error?.data, err.revert?.data]) {
    if (typeof v === "string" && v.startsWith("0x") && v.length >= 10) return v;
    if (v && typeof v.data === "string" && v.data.startsWith("0x")) return v.data;
  }
  return findData(err.error, depth + 1) ?? findData(err.info?.error, depth + 1) ?? findData(err.cause, depth + 1);
}

/** Turns any wallet/contract error into a human-readable sentence. */
export function decodeError(err: any): string {
  if (err?.code === "ACTION_REJECTED" || err?.code === 4001 || /user rejected/i.test(err?.message ?? "")) return "Transaction rejected in wallet.";
  const data = findData(err);
  if (data && iface) {
    try {
      const parsed = iface.parseError(data);
      if (parsed) return MESSAGES[parsed.name]?.(Array.from(parsed.args)) ?? parsed.name;
    } catch { /* fall through */ }
  }
  if (err?.revert?.name) return MESSAGES[err.revert.name]?.(Array.from(err.revert.args ?? [])) ?? err.revert.name;
  const m = String(err?.shortMessage ?? err?.reason ?? err?.message ?? err);
  if (/could not detect network|failed to fetch|ECONNREFUSED/i.test(m)) return "Cannot reach the blockchain node. Is Ganache running?";
  return m.length > 220 ? m.slice(0, 220) + "…" : m;
}
