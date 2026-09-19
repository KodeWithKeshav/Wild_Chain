import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardPlus, FilePlus2 } from "lucide-react";
import { useAnimalDetail, useAnimals } from "../hooks";
import { useWeb3 } from "../context/Web3Context";
import { AnimalPicker, GuardedButton, MILESTONE_TYPES, Notice, PageHeader, Section } from "../components/ui";
import { FileInput } from "../components/FileInput";
import { canAddEvidence, canRecordMilestone, milestoneTypesFor } from "../lib/permissions";
import { prepareEvidence } from "../lib/evidence";
import { ZERO_HASH } from "../lib/hash";
import { decodeError } from "../lib/errors";
import { STATUSES } from "../lib/chain";

const EVIDENCE_TYPES = ["PHOTO", "MEDICAL_REPORT", "LAB_RESULT", "X_RAY", "BEHAVIOUR_LOG", "OTHER"];

export default function Record() {
  const { data: animals } = useAnimals();
  const { account, myOrg, run } = useWeb3();
  const [params] = useSearchParams();
  const [animalId, setAnimalId] = useState<number | null>(params.get("animal") ? Number(params.get("animal")) : null);
  const { data: d, wasCustodian } = useAnimalDetail(animalId);

  const [mType, setMType] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [mFile, setMFile] = useState<File | null>(null);
  const [eType, setEType] = useState(EVIDENCE_TYPES[1]);
  const [eFile, setEFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowedTypes = myOrg ? milestoneTypesFor(myOrg.orgType) : [];
  const type = mType === "" ? allowedTypes[0] : mType;
  const mv = d ? canRecordMilestone(d.animal, myOrg, account) : { ok: false, reason: "Select an animal." };
  const ev = d ? canAddEvidence(d.animal, myOrg, wasCustodian) : { ok: false, reason: "Select an animal." };
  const list = (animals ?? []).filter((a) => a.status < 6);

  async function submitMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!d || type === undefined) return;
    setBusy("m"); setError(null);
    try {
      const f = mFile ? await prepareEvidence(mFile) : { hash: ZERO_HASH, cid: "" };
      const r = await run(`Record ${MILESTONE_TYPES[type]} milestone`, (c) => c.recordMilestone(d.animal.id, type, note.trim(), f.hash, f.cid));
      if (r) { setNote(""); setMFile(null); }
    } catch (err) { setError(decodeError(err)); } finally { setBusy(null); }
  }

  async function submitEvidence(e: React.FormEvent) {
    e.preventDefault();
    if (!d || !eFile) return;
    setBusy("e"); setError(null);
    try {
      const f = await prepareEvidence(eFile);
      const r = await run(`Add ${eType.toLowerCase().replace(/_/g, " ")} evidence`, (c) => c.addEvidence(d.animal.id, eType, f.hash, f.cid));
      if (r) setEFile(null);
    } catch (err) { setError(decodeError(err)); } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader title="Milestones & evidence" subtitle="Record treatment and rehabilitation progress, or attach supporting files. Files are hashed in your browser and stored on IPFS; only the hash and CID go on-chain." />
      {!account && <div className="mb-4"><Notice tone="warn">Connect an organization wallet to record data.</Notice></div>}
      <div className="mb-5 max-w-md"><AnimalPicker animals={list} value={animalId} onChange={setAnimalId} /></div>
      {d && <p className="mb-4 text-sm text-forest-800/70">Status: <b>{STATUSES[d.animal.status]}</b>. New milestones are unverified until a different organization verifies them on the animal's page.</p>}
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={submitMilestone}>
          <Section title="Record milestone" icon={<ClipboardPlus className="h-5 w-5 text-forest-600" />}>
            <div className="space-y-4">
              <div>
                <label className="label">Milestone type</label>
                <select className="input" value={type ?? ""} onChange={(e) => setMType(Number(e.target.value))} disabled={allowedTypes.length === 0}>
                  {allowedTypes.length === 0 && <option>Not available for your organization type</option>}
                  {allowedTypes.map((t) => <option key={t} value={t}>{MILESTONE_TYPES[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Note ({note.length}/280)</label>
                <textarea className="input min-h-24" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short clinical / progress note. No personal data." />
              </div>
              <FileInput file={mFile} onChange={setMFile} label="Supporting file (optional)" />
              <GuardedButton type="submit" busy={busy === "m"} verdict={!note.trim() ? { ok: false, reason: "Enter a note." } : mv}>Record milestone</GuardedButton>
              {!mv.ok && d && <p className="text-xs text-forest-800/60">{mv.reason}</p>}
            </div>
          </Section>
        </form>
        <form onSubmit={submitEvidence}>
          <Section title="Add evidence" icon={<FilePlus2 className="h-5 w-5 text-forest-600" />}>
            <div className="space-y-4">
              <div>
                <label className="label">Evidence type</label>
                <select className="input" value={eType} onChange={(e) => setEType(e.target.value)}>{EVIDENCE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select>
              </div>
              <FileInput file={eFile} onChange={setEFile} label="File (required)" />
              <GuardedButton type="submit" busy={busy === "e"} verdict={!eFile ? { ok: false, reason: "Choose a file." } : ev}>Hash, upload & record</GuardedButton>
              {!ev.ok && d && <p className="text-xs text-forest-800/60">{ev.reason}</p>}
            </div>
          </Section>
        </form>
      </div>
    </>
  );
}
