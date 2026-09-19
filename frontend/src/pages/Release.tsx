import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Leaf, Stamp } from "lucide-react";
import { useAnimalDetail, useAnimals } from "../hooks";
import { useWeb3 } from "../context/Web3Context";
import { AnimalPicker, CidLink, Empty, GuardedButton, HashText, Notice, OrgChip, PageHeader, Section, StatusBadge } from "../components/ui";
import { FileInput } from "../components/FileInput";
import { canAuthorizeRelease, canRelease } from "../lib/permissions";
import { prepareEvidence } from "../lib/evidence";
import { ZERO_HASH } from "../lib/hash";
import { decodeError } from "../lib/errors";
import { fmtDate } from "../lib/format";
import { Status } from "../lib/chain";

export default function Release() {
  const { data: animals } = useAnimals();
  const { account, myOrg, run } = useWeb3();
  const [params] = useSearchParams();
  const ready = (animals ?? []).filter((a) => a.status === Status.RELEASE_READY);
  const [animalId, setAnimalId] = useState<number | null>(params.get("animal") ? Number(params.get("animal")) : null);
  const { data: d } = useAnimalDetail(animalId);
  const [permit, setPermit] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const auth = d ? canAuthorizeRelease(d.animal, myOrg, d.releaseAuth.authorized) : { ok: false, reason: "Select an animal." };
  const rel = d ? canRelease(d.animal, myOrg, account, d.releaseAuth.authorized, d.releaseAuth.authorizedBy) : { ok: false, reason: "Select an animal." };

  async function authorize(e: React.FormEvent) {
    e.preventDefault();
    if (!d || !permit) return;
    setBusy("auth"); setError(null);
    try {
      const f = await prepareEvidence(permit);
      await run(`Authorize release of #${d.animal.id}`, (c) => c.authorizeRelease(d.animal.id, f.hash, f.cid));
      setPermit(null);
    } catch (err) { setError(decodeError(err)); } finally { setBusy(null); }
  }
  async function release(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return;
    setBusy("rel"); setError(null);
    try {
      const f = photo ? await prepareEvidence(photo) : { hash: ZERO_HASH, cid: "" };
      await run(`Release #${d.animal.id} to the wild`, (c) => c.releaseAnimal(d.animal.id, note.trim(), f.hash, f.cid));
    } catch (err) { setError(decodeError(err)); } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader title="Release" subtitle="A Forest Department authorizes release once an animal is Release ready. The custodian (or that department) then records the release, which is final." />
      {ready.length === 0 && <div className="mb-4"><Empty>No animals are Release ready right now.</Empty></div>}
      <div className="mb-5 max-w-md"><AnimalPicker animals={ready} value={animalId} onChange={setAnimalId} label="Release-ready animal" /></div>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {d && (
        <>
          <div className="mb-4 flex items-center gap-3 text-sm"><StatusBadge status={d.animal.status} /><Link className="font-semibold text-forest-600 underline" to={`/animals/${d.animal.id}`}>Open full record</Link><span>Custodian: <OrgChip address={d.animal.currentCustodian} /></span></div>
          <div className="grid gap-5 lg:grid-cols-2">
            <form onSubmit={authorize}>
              <Section title="1 · Authorize release" icon={<Stamp className="h-5 w-5 text-forest-600" />}>
                {d.releaseAuth.authorized ? (
                  <div className="space-y-2 text-sm"><Notice tone="info">Authorized on {fmtDate(d.releaseAuth.authorizedAt)}.</Notice><OrgChip address={d.releaseAuth.authorizedBy} /><div><HashText hash={d.releaseAuth.permitHash} /> <CidLink cid={d.releaseAuth.permitCid} /></div></div>
                ) : (
                  <div className="space-y-4">
                    <FileInput file={permit} onChange={setPermit} label="Release permit (required)" hint="Hashed here and stored on IPFS." />
                    <GuardedButton type="submit" busy={busy === "auth"} verdict={!permit ? { ok: false, reason: "Choose the permit file." } : auth}>Authorize release</GuardedButton>
                    {!auth.ok && <p className="text-xs text-forest-800/60">{auth.reason}</p>}
                  </div>
                )}
              </Section>
            </form>
            <form onSubmit={release}>
              <Section title="2 · Release to the wild" icon={<Leaf className="h-5 w-5 text-forest-600" />}>
                <div className="space-y-4">
                  <div><label className="label">Release location note ({note.length}/280)</label><textarea className="input min-h-20" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Coarse location only, e.g. forest edge, sector 4" /></div>
                  <FileInput file={photo} onChange={setPhoto} label="Release photo (optional)" />
                  <GuardedButton type="submit" busy={busy === "rel"} verdict={!note.trim() ? { ok: false, reason: "Enter a location note." } : rel}>Release animal</GuardedButton>
                  {!rel.ok && <p className="text-xs text-forest-800/60">{rel.reason}</p>}
                </div>
              </Section>
            </form>
          </div>
        </>
      )}
    </>
  );
}
