import type { EvidenceStore } from "./types";

/**
 * Talks to a local IPFS (Kubo) daemon. Uploads use the HTTP API; downloads use the gateway.
 * No secrets are involved: the daemon must be your own local node (see README for the CORS setup).
 * To use a pinning service instead, replace this class with one that calls YOUR backend proxy
 * (the proxy holds the Pinata/web3.storage key) and keep the same EvidenceStore interface.
 */
export class KuboStore implements EvidenceStore {
  readonly name: string;
  constructor(private api = "http://127.0.0.1:5001", private gateway = "http://127.0.0.1:8080") {
    this.name = `IPFS (Kubo @ ${api})`;
  }

  async upload(file: File | Blob) {
    const form = new FormData();
    form.append("file", file, file instanceof File ? file.name : "evidence");
    let res: Response;
    try {
      res = await fetch(`${this.api}/api/v0/add?cid-version=1&pin=true`, { method: "POST", body: form });
    } catch {
      throw new Error(`Cannot reach the IPFS daemon at ${this.api}. Start it with "ipfs daemon" and allow CORS (see README), or set VITE_STORAGE=memory.`);
    }
    if (!res.ok) throw new Error(`IPFS upload failed (${res.status}).`);
    const json = (await res.json()) as { Hash: string };
    return { cid: json.Hash };
  }

  async fetch(cid: string) {
    let res: Response;
    try {
      res = await fetch(`${this.gateway}/ipfs/${cid}`);
    } catch {
      throw new Error(`Cannot reach the IPFS gateway at ${this.gateway}.`);
    }
    if (!res.ok) throw new Error(`IPFS gateway returned ${res.status} for ${cid}.`);
    return res.blob();
  }
}
