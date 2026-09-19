import { sha256Hex } from "../hash";
import type { EvidenceStore } from "./types";

/** In-memory mock: files live only as long as the page. For tests and offline demos. */
export class MemoryStore implements EvidenceStore {
  readonly name = "memory (mock, not persistent)";
  private files = new Map<string, Blob>();

  async upload(file: File | Blob) {
    const cid = "bafymem" + (await sha256Hex(file)).slice(2, 50);
    this.files.set(cid, file);
    return { cid };
  }

  async fetch(cid: string) {
    const blob = this.files.get(cid);
    if (!blob) throw new Error(`CID ${cid} is not in the in-memory store (it only holds files uploaded in this browser session).`);
    return blob;
  }
}
