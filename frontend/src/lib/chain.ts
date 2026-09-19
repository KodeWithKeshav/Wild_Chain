import deployments from "../contracts/deployment.json";
import abi from "../contracts/WildlifeChainOfCustody.abi.json";

export { abi };

export const ORG_TYPES = ["Rescue Team", "Veterinary Hospital", "Rehabilitation Centre", "Forest Department", "Conservation Org"] as const;
export const ORG_SHORT = ["Rescue", "Vet", "Rehab", "Forest", "Conservation"] as const;
export const OrgType = { Rescue: 0, Vet: 1, Rehab: 2, Forest: 3, Conservation: 4 } as const;

export const STATUSES = ["Rescued", "Triaged", "Under treatment", "Recovering", "Rehabilitation", "Release ready", "Released"] as const;
export const Status = { RESCUED: 0, TRIAGED: 1, UNDER_TREATMENT: 2, RECOVERING: 3, REHABILITATION: 4, RELEASE_READY: 5, RELEASED: 6 } as const;

export const MILESTONE_TYPES = ["Assessment", "Treatment", "Recovery", "Rehabilitation"] as const;
export const MType = { ASSESSMENT: 0, TREATMENT: 1, RECOVERY: 2, REHABILITATION: 3 } as const;

export const EVENT_TYPES = [
  "Registered", "Transfer requested", "Transfer accepted", "Transfer cancelled", "Transfer rejected",
  "Milestone recorded", "Milestone verified", "Status changed", "Evidence added", "Release authorized", "Released",
] as const;

export interface Deployment { chainId: number; address: string; deployedAt: string }
export const deployment = (chainId: number | null): Deployment | null =>
  chainId == null ? null : ((deployments as Record<string, Deployment>)[String(chainId)] ?? null);

export interface NetworkInfo { chainId: number; name: string; rpcUrl: string; explorer?: string; currency: string }
export const NETWORKS: Record<number, NetworkInfo> = {
  1337: { chainId: 1337, name: "Ganache (local)", rpcUrl: import.meta.env.VITE_RPC_URL || "http://127.0.0.1:7545", currency: "ETH" },
  11155111: { chainId: 11155111, name: "Sepolia", rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io", currency: "SepoliaETH" },
};
/** Networks that have a deployment in deployment.json. */
export const supportedChainIds = () => Object.keys(deployments).map(Number);
/** Preferred network to read from before a wallet is connected. */
export const defaultChainId = () => (supportedChainIds().includes(1337) ? 1337 : (supportedChainIds()[0] ?? 1337));

// ------------------------------------------------------------ record types
export interface Org { address: string; name: string; orgType: number; active: boolean; registered: boolean }
export interface Animal {
  id: number; species: string; identityHash: string; status: number;
  currentCustodian: string; previousCustodian: string; registeredBy: string; registeredAt: number; pendingTransferTo: string;
}
export interface CustodyRecord { from: string; to: string; requestedAt: number; acceptedAt: number; evidenceHash: string }
export interface Milestone {
  index: number; type: number; recordedBy: string; recordedAt: number; note: string; evidenceHash: string; cid: string;
  verified: boolean; verifiedBy: string; verifiedAt: number;
}
export interface Evidence { index: number; type: string; hash: string; cid: string; uploadedBy: string; uploadedAt: number }
export interface TimelineEntry { eventType: number; actor: string; timestamp: number; refIndex: number }
export interface ReleaseAuth { authorized: boolean; authorizedBy: string; authorizedAt: number; permitHash: string; permitCid: string }
export interface ReleaseRecord { released: boolean; releasedBy: string; releasedAt: number; locationNote: string; evidenceHash: string; cid: string }
export interface AnimalDetail {
  animal: Animal; milestones: Milestone[]; history: CustodyRecord[]; evidence: Evidence[]; timeline: TimelineEntry[];
  pending: { to: string; requestedAt: number; evidenceHash: string };
  releaseAuth: ReleaseAuth; releaseRecord: ReleaseRecord;
}
