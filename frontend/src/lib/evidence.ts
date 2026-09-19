import { sha256Hex } from "./hash";
import { evidenceStore } from "./storage";

/** Hash the file locally (SHA-256 of raw bytes), upload it to the evidence store, return both for the on-chain record. */
export async function prepareEvidence(file: File): Promise<{ hash: string; cid: string }> {
  const hash = await sha256Hex(file);
  const { cid } = await evidenceStore.upload(file);
  return { hash, cid };
}
