import { KuboStore } from "./KuboStore";
import { MemoryStore } from "./MemoryStore";
import type { EvidenceStore } from "./types";

export type { EvidenceStore } from "./types";
export const IPFS_GATEWAY: string = import.meta.env.VITE_IPFS_GATEWAY || "http://127.0.0.1:8080";

/** Chosen by VITE_STORAGE=kubo|memory (default kubo). */
function create(): EvidenceStore {
  if ((import.meta.env.VITE_STORAGE || "kubo") === "memory") return new MemoryStore();
  return new KuboStore(import.meta.env.VITE_IPFS_API || "http://127.0.0.1:5001", IPFS_GATEWAY);
}

export const evidenceStore: EvidenceStore = create();
export const gatewayUrl = (cid: string) => `${IPFS_GATEWAY}/ipfs/${cid}`;
