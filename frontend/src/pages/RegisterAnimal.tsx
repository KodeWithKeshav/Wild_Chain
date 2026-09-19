import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PawPrint } from "lucide-react";
import { useWeb3 } from "../context/Web3Context";
import { FileInput } from "../components/FileInput";
import { GuardedButton, Notice, PageHeader, Section } from "../components/ui";
import { canRegister } from "../lib/permissions";
import { prepareEvidence } from "../lib/evidence";
import { sha256Text, ZERO_HASH } from "../lib/hash";
import { decodeError } from "../lib/errors";

const COMMON = ["Spotted Deer", "Bengal Tiger", "Golden Eagle", "Indian Leopard", "Asian Elephant", "Sloth Bear", "Indian Star Tortoise", "King Cobra", "Slender Loris"];

export default function RegisterAnimal() {
  const { myOrg, run, account } = useWeb3();
  const nav = useNavigate();
  const [species, setSpecies] = useState("");
  const [tag, setTag] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verdict = canRegister(myOrg);
  const valid = species.trim().length > 0 && species.length <= 64 && !!file;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const ev = await prepareEvidence(file);
      const identity = tag.trim() ? await sha256Text(tag.trim()) : ZERO_HASH;
      const receipt = await run(`Register ${species.trim()}`, (c) => c.registerAnimal(species.trim(), identity, ev.hash, ev.cid));
      const log: any = receipt?.logs.find((l: any) => l.eventName === "AnimalRegistered");
      if (receipt) nav(log ? `/animals/${log.args.animalId}` : "/");
    } catch (err) { setError(decodeError(err)); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Register a rescued animal" subtitle="Creates a permanent digital identity. The rescue photo is hashed here, stored on IPFS, and only its hash and CID go on-chain." />
      {!account && <div className="mb-4"><Notice tone="warn">Connect an organization wallet to register animals.</Notice></div>}
      {account && !verdict.ok && <div className="mb-4"><Notice tone="warn">{verdict.reason}</Notice></div>}
      <div className="grid gap-5 lg:grid-cols-3">
        <form onSubmit={submit} className="lg:col-span-2">
          <Section title="Animal details" icon={<PawPrint className="h-5 w-5 text-forest-600" />}>
            <div className="space-y-4">
              <div>
                <label className="label">Species</label>
                <input className="input" list="species" value={species} maxLength={64} onChange={(e) => setSpecies(e.target.value)} placeholder="e.g. Spotted Deer" required />
                <datalist id="species">{COMMON.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div>
                <label className="label">Tag / microchip / collar ID <span className="normal-case tracking-normal text-forest-800/50">(optional)</span></label>
                <input className="input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Only its SHA-256 hash is stored on-chain" />
              </div>
              <FileInput file={file} onChange={setFile} label="Rescue photo / initial evidence (required)" />
              {error && <Notice tone="error">{error}</Notice>}
              <GuardedButton type="submit" verdict={valid ? verdict : { ok: false, reason: "Enter a species and choose a file." }} busy={busy}>Register animal on-chain</GuardedButton>
            </div>
          </Section>
        </form>
        <Section title="What gets stored">
          <ul className="space-y-3 text-sm text-forest-800/80">
            <li><b className="text-forest-900">On-chain:</b> species, a unique ID, status RESCUED, you as first custodian, the photo's SHA-256 hash and IPFS CID, and a timestamped timeline entry.</li>
            <li><b className="text-forest-900">On IPFS:</b> the photo itself. Public IPFS is public — never upload anything you would not publish.</li>
            <li><b className="text-forest-900">Never:</b> personal data.</li>
          </ul>
        </Section>
      </div>
    </>
  );
}
