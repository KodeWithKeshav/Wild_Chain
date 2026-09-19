import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, CloudDownload, FileSearch, ShieldAlert, ShieldCheck } from "lucide-react";
import { useAnimalDetail, useAnimals } from "../hooks";
import { useWeb3 } from "../context/Web3Context";
import { AnimalPicker, CidLink, HashText, Notice, OrgChip, PageHeader, Section } from "../components/ui";
import { FileInput } from "../components/FileInput";
import { sha256Hex } from "../lib/hash";
import { evidenceStore } from "../lib/storage";
import { decodeError } from "../lib/errors";
import { fmtDate } from "../lib/format";
import type { Evidence } from "../lib/chain";

type Result = { match: boolean; hash: string; record?: Evidence; note?: string } | null;

export default function Verify() {
  const { data: animals } = useAnimals();
  const { read } = useWeb3();
  const [params] = useSearchParams();
  const [animalId, setAnimalId] = useState<number | null>(params.get("animal") ? Number(params.get("animal")) : null);
  const { data: d } = useAnimalDetail(animalId);
  const [mode, setMode] = useState<"file" | "cid">("file");
  const [file, setFile] = useState<File | null>(null);
  const [cid, setCid] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setResult(null); setError(null); }, [mode, animalId]);

  // Compare a computed hash with the on-chain evidence list.
  async function compare(hash: string, expectRecord?: Evidence): Promise<Result> {
    const [found, index] = await read!.verifyEvidenceHash(animalId, hash);
    const record = found ? d?.evidence[Number(index)] : undefined;
    if (expectRecord && !found) return { match: false, hash, record: expectRecord, note: `The content served for this CID does not match the hash that was recorded on-chain (${expectRecord.hash.slice(0, 12)}…). It has been modified or is a different file.` };
    return { match: !!found, hash, record };
  }

  async function checkFile(f: File | null) {
    setFile(f); setResult(null); setError(null);
    if (!f || !animalId || !read) return;
    setBusy(true);
    try { setResult(await compare(await sha256Hex(f))); } catch (e) { setError(decodeError(e)); } finally { setBusy(false); }
  }

  async function checkCid(value: string) {
    if (!animalId || !read || !value.trim()) return;
    setBusy(true); setResult(null); setError(null);
    try {
      const blob = await evidenceStore.fetch(value.trim());
      const expected = d?.evidence.find((e) => e.cid === value.trim());
      setResult(await compare(await sha256Hex(blob), expected));
    } catch (e) { setError(decodeError(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Verify evidence" subtitle="Re-hash a file and compare it with the hashes recorded on-chain. MATCH means it is byte-for-byte what was recorded; MISMATCH means it was modified (or was never recorded)." />
      <div className="mb-5 max-w-md"><AnimalPicker animals={animals ?? []} value={animalId} onChange={setAnimalId} /></div>

      <div className="mb-4 inline-flex rounded-xl bg-forest-100 p-1 text-sm font-semibold">
        {([["file", "Upload a file", FileSearch], ["cid", "Fetch from IPFS by CID", CloudDownload]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setMode(k)} className={`flex items-center gap-2 rounded-lg px-4 py-2 transition ${mode === k ? "bg-white text-forest-900 shadow" : "text-forest-700 hover:text-forest-900"}`}><Icon className="h-4 w-4" />{label}</button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={mode === "file" ? "Drop the file to check" : "Retrieve from IPFS"} icon={<ShieldCheck className="h-5 w-5 text-forest-600" />}>
          {!animalId ? <p className="text-sm text-forest-800/60">Select an animal first.</p> : mode === "file" ? (
            <FileInput file={file} onChange={checkFile} label="File to verify" hint="Hashed locally with SHA-256; the file never leaves your browser." />
          ) : (
            <div className="space-y-3">
              <div>
                <label className="label">CID</label>
                <input className="input mono" value={cid} onChange={(e) => setCid(e.target.value)} placeholder="bafy…" list="cids" />
                <datalist id="cids">{d?.evidence.filter((e) => e.cid && !e.cid.startsWith("offline-demo-")).map((e) => <option key={e.index} value={e.cid}>{e.type}</option>)}</datalist>
              </div>
              <button className="btn-primary" disabled={busy || !cid.trim()} onClick={() => checkCid(cid)}>Fetch, hash & compare</button>
              {d && d.evidence.length > 0 && (
                <div className="text-xs text-forest-800/70">Or pick a recorded CID:
                  <div className="mt-1 flex flex-wrap gap-1.5">{d.evidence.filter((e) => e.cid).map((e) => (
                    <button key={e.index} className="rounded-md bg-forest-100 px-2 py-1 font-medium text-forest-800 hover:bg-forest-200" onClick={() => { setCid(e.cid); checkCid(e.cid); }}>{e.type.replace(/_/g, " ").toLowerCase()} #{e.index}</button>))}</div>
                </div>
              )}
            </div>
          )}
          {busy && <p className="mt-3 text-sm text-forest-700">Hashing and comparing…</p>}
          {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        </Section>

        <div className="space-y-4">
          {result ? (
            <div className={`card rise overflow-hidden ${result.match ? "ring-2 ring-emerald-500" : "ring-2 ring-rose-500"}`}>
              <div className={`flex items-center gap-3 p-5 text-white ${result.match ? "bg-emerald-600" : "bg-rose-600"}`}>
                {result.match ? <CheckCircle2 className="h-9 w-9" /> : <ShieldAlert className="h-9 w-9" />}
                <div><div className="font-display text-2xl font-bold">{result.match ? "MATCH — valid" : "MISMATCH — modified"}</div>
                  <div className="text-sm opacity-90">{result.match ? "This file's hash is recorded on-chain for this animal." : "No on-chain record has this hash."}</div></div>
              </div>
              <div className="space-y-3 p-5 text-sm">
                <div><div className="label">Computed SHA-256</div><HashText hash={result.hash} /></div>
                {result.record && (
                  <>
                    <div><div className="label">{result.match ? "Matched record" : "Recorded hash for this CID"}</div><div className="font-medium">{result.record.type.replace(/_/g, " ")} <span className="text-forest-800/60">· record #{result.record.index}</span></div><HashText hash={result.record.hash} /></div>
                    <div><div className="label">Uploaded by</div><OrgChip address={result.record.uploadedBy} /> <span className="text-xs text-forest-800/60">on {fmtDate(result.record.uploadedAt)}</span></div>
                    <div><div className="label">CID</div><CidLink cid={result.record.cid} /></div>
                  </>
                )}
                {result.note && <Notice tone="error">{result.note}</Notice>}
              </div>
            </div>
          ) : (
            <div className="card flex h-full min-h-48 items-center justify-center p-8 text-center text-sm text-forest-800/50">The verification result appears here.</div>
          )}
        </div>
      </div>
    </>
  );
}
