/** Off-chain evidence storage. Only the CID and the SHA-256 hash ever go on-chain. */
export interface EvidenceStore {
  readonly name: string;
  upload(file: File | Blob): Promise<{ cid: string }>;
  fetch(cid: string): Promise<Blob>;
}
