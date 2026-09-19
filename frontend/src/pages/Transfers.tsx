import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeftRight, Check, Send, X } from "lucide-react";
import { useAnimals } from "../hooks";
import { useWeb3 } from "../context/Web3Context";
import { AnimalPicker, Empty, GuardedButton, Notice, OrgChip, PageHeader, Section, StatusBadge } from "../components/ui";
import { canRequestTransfer } from "../lib/permissions";
import { isZeroAddr, sameAddr, speciesEmoji } from "../lib/format";
import { ORG_TYPES, Status, type Animal } from "../lib/chain";
import { FileInput } from "../components/FileInput";
import { prepareEvidence } from "../lib/evidence";
import { ZERO_HASH } from "../lib/hash";
import { decodeError } from "../lib/errors";

export default function Transfers() {
  const { data: animals } = useAnimals();
  const { account, myOrg, orgs, orgName, run, read, refreshKey } = useWeb3();
  const [params] = useSearchParams();
  const [animalId, setAnimalId] = useState<number | null>(params.get("animal") ? Number(params.get("animal")) : null);
  const [to, setTo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<boolean[][] | null>(null);

  // transfer matrix (re-read after admin edits)
  useEffect(() => { read?.transferMatrix().then((m: any) => setMatrix(m.map((r: any) => Array.from(r) as boolean[]))).catch(() => setMatrix(null)); }, [read, refreshKey]);

  const list = animals ?? [];
  const incoming = list.filter((a) => sameAddr(a.pendingTransferTo, account));
  const outgoing = list.filter((a) => !isZeroAddr(a.pendingTransferTo) && sameAddr(a.currentCustodian, account));
  const mine = list.filter((a) => sameAddr(a.currentCustodian, account) && a.status !== Status.RELEASED && isZeroAddr(a.pendingTransferTo));
  const selected = list.find((a) => a.id === animalId) ?? null;
  const verdict = selected ? canRequestTransfer(selected, myOrg, account) : { ok: false, reason: "Select an animal." };
  const recipients = orgs.filter((o) => o.active && !sameAddr(o.address, account) && myOrg && matrix?.[myOrg.orgType]?.[o.orgType]);

  const act = async (key: string, label: string, fn: Parameters<typeof run>[1]) => { setBusy(key); await run(label, fn); setBusy(null); };

  async function request(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !to) return;
    setBusy("req"); setError(null);
    try {
      const ev = file ? await prepareEvidence(file) : { hash: ZERO_HASH, cid: "" };
      const r = await run(`Request transfer of #${selected.id} to ${orgName(to)}`, (c) => c.requestTransfer(selected.id, to, ev.hash, ev.cid));
      if (r) { setTo(""); setFile(null); }
    } catch (err) { setError(decodeError(err)); } finally { setBusy(null); }
  }

  const Row = ({ a, children, note }: { a: Animal; children: React.ReactNode; note: React.ReactNode }) => (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-forest-900/10 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sand-100 text-xl">{speciesEmoji(a.species)}</div>
        <div><Link to={`/animals/${a.id}`} className="font-display text-base font-bold hover:underline">#{a.id} {a.species}</Link><div className="text-xs text-forest-800/70">{note}</div></div>
      </div>
      <div className="flex items-center gap-2"><StatusBadge status={a.status} />{children}</div>
    </li>
  );

  return (
    <>
      <PageHeader title="Custody transfers" subtitle="Two-party handshake: the current custodian requests, the receiving organization accepts — only then does custody change." />
      {!account && <div className="mb-4"><Notice tone="warn">Connect your wallet to see and act on transfers.</Notice></div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Incoming requests" icon={<ArrowLeftRight className="h-5 w-5 text-forest-600" />}>
          {incoming.length === 0 ? <Empty>No transfers waiting for your acceptance.</Empty> : (
            <ul className="space-y-3">{incoming.map((a) => (
              <Row key={a.id} a={a} note={<>From <b>{orgName(a.currentCustodian)}</b></>}>
                <GuardedButton className="btn-primary btn-sm" busy={busy === `a${a.id}`} onClick={() => act(`a${a.id}`, `Accept custody of #${a.id}`, (c) => c.acceptTransfer(a.id))}><Check className="h-3.5 w-3.5" />Accept</GuardedButton>
                <GuardedButton className="btn-danger btn-sm" busy={busy === `r${a.id}`} onClick={() => act(`r${a.id}`, `Reject transfer of #${a.id}`, (c) => c.rejectTransfer(a.id))}><X className="h-3.5 w-3.5" />Reject</GuardedButton>
              </Row>))}</ul>)}
        </Section>
        <Section title="Outgoing requests" icon={<Send className="h-5 w-5 text-forest-600" />}>
          {outgoing.length === 0 ? <Empty>You have no pending outgoing requests.</Empty> : (
            <ul className="space-y-3">{outgoing.map((a) => (
              <Row key={a.id} a={a} note={<>Waiting on <b>{orgName(a.pendingTransferTo)}</b></>}>
                <GuardedButton className="btn-danger btn-sm" busy={busy === `c${a.id}`} onClick={() => act(`c${a.id}`, `Cancel transfer of #${a.id}`, (c) => c.cancelTransfer(a.id))}>Cancel</GuardedButton>
              </Row>))}</ul>)}
        </Section>
      </div>

      <div className="mt-5">
        <Section title="Request a new transfer" icon={<Send className="h-5 w-5 text-forest-600" />}>
          <form onSubmit={request} className="grid gap-4 md:grid-cols-2">
            <AnimalPicker animals={mine} value={animalId} onChange={(id) => { setAnimalId(id); setTo(""); }} label="Animal in your custody" />
            <div>
              <label className="label">Recipient organization</label>
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)} disabled={!selected}>
                <option value="">{selected ? "Select recipient…" : "Select an animal first"}</option>
                {recipients.map((o) => <option key={o.address} value={o.address}>{o.name} — {ORG_TYPES[o.orgType]}</option>)}
              </select>
              {selected && myOrg && <p className="mt-1 text-xs text-forest-800/60">Only organizations allowed by the transfer matrix for a {ORG_TYPES[myOrg.orgType]} are listed.</p>}
            </div>
            <div className="md:col-span-2"><FileInput file={file} onChange={setFile} label="Hand-over document (optional)" hint="Hashed here and pinned to IPFS; hash stored with the request." /></div>
            {selected && <div className="md:col-span-2 text-sm text-forest-800/70">Current custodian: <OrgChip address={selected.currentCustodian} /></div>}
            {error && <div className="md:col-span-2"><Notice tone="error">{error}</Notice></div>}
            <div className="md:col-span-2"><GuardedButton type="submit" busy={busy === "req"} verdict={!to ? { ok: false, reason: "Choose a recipient." } : verdict}><Send className="h-4 w-4" />Request transfer</GuardedButton></div>
          </form>
        </Section>
      </div>
    </>
  );
}
