import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, BadgeCheck, ClipboardList, FileCheck2, History, Leaf, Route, ShieldCheck, Stethoscope } from "lucide-react";
import { useAnimalDetail } from "../hooks";
import { useWeb3 } from "../context/Web3Context";
import { BackLink, CidLink, Empty, GuardedButton, HashText, LifecycleStepper, MILESTONE_TYPES, Notice, OrgChip, Section, StatusBadge, TimelineList } from "../components/ui";
import { fmtDate, isZeroAddr, speciesEmoji } from "../lib/format";
import { EVENT_TYPES, STATUSES, type AnimalDetail } from "../lib/chain";
import { canAdvance, canVerify } from "../lib/permissions";
import { isZeroHash } from "../lib/hash";

function describe(d: AnimalDetail) {
  return (e: { eventType: number; refIndex: number }) => {
    switch (EVENT_TYPES[e.eventType]) {
      case "Registered": return `${d.animal.species} registered; custody begins.`;
      case "Transfer requested": return "Custody hand-over proposed to another organization.";
      case "Transfer accepted": { const r = d.history[e.refIndex]; return r ? `Custody passed to the receiving organization.` : "Custody passed."; }
      case "Milestone recorded": case "Milestone verified": { const m = d.milestones[e.refIndex]; return m ? `${MILESTONE_TYPES[m.type]}: ${m.note}` : ""; }
      case "Status changed": return `Now ${STATUSES[e.refIndex]}.`;
      case "Evidence added": { const ev = d.evidence[e.refIndex]; return ev ? `${ev.type} file recorded (${ev.hash.slice(0, 10)}…).` : ""; }
      case "Released": return d.releaseRecord.locationNote;
      default: return "";
    }
  };
}

export default function AnimalDetailPage() {
  const id = Number(useParams().id);
  const { data: d, loading, error, wasCustodian } = useAnimalDetail(Number.isFinite(id) ? id : null);
  const { account, myOrg, run, orgName } = useWeb3();
  const [busy, setBusy] = useState<string | null>(null);

  if (loading) return <div className="card h-64 animate-pulse" />;
  if (error || !d) return <><BackLink to="/">All animals</BackLink><Notice tone="error">{error ?? "Animal not found."}</Notice></>;

  const { animal: a, milestones, history, evidence, timeline } = d;
  const adv = canAdvance(a, milestones, myOrg, account);
  const pending = !isZeroAddr(a.pendingTransferTo);
  const go = async (key: string, label: string, fn: Parameters<typeof run>[1]) => { setBusy(key); await run(label, fn); setBusy(null); };

  return (
    <div className="space-y-5">
      <BackLink to="/">All animals</BackLink>
      <div className="card rise overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-forest-800 to-forest-600 p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-4xl">{speciesEmoji(a.species)}</div>
            <div>
              <h1 className="text-3xl font-bold">{a.species}</h1>
              <div className="mono text-forest-100">Animal ID #{a.id} · registered {fmtDate(a.registeredAt)}</div>
            </div>
          </div>
          <StatusBadge status={a.status} />
        </div>
        <div className="p-6"><LifecycleStepper status={a.status} /></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Custody" icon={<Route className="h-5 w-5 text-forest-600" />}>
          <dl className="space-y-3 text-sm">
            <div><dt className="label">Current custodian</dt><dd><OrgChip address={a.currentCustodian} /></dd></div>
            <div><dt className="label">Previous custodian</dt><dd>{isZeroAddr(a.previousCustodian) ? <span className="text-forest-800/50">None yet</span> : <OrgChip address={a.previousCustodian} />}</dd></div>
            <div><dt className="label">Registered by</dt><dd><OrgChip address={a.registeredBy} /></dd></div>
            <div><dt className="label">Identity hash</dt><dd>{isZeroHash(a.identityHash) ? <span className="text-forest-800/50">Not provided</span> : <HashText hash={a.identityHash} />}</dd></div>
          </dl>
          {pending && (
            <div className="mt-4"><Notice tone="warn">Transfer to <b>{d.pending.to.slice(0, 8)}…</b> awaits acceptance. <Link className="font-semibold underline" to="/transfers">Manage transfers</Link></Notice></div>
          )}
        </Section>

        <Section title="Actions" icon={<Stethoscope className="h-5 w-5 text-forest-600" />}>
          <div className="space-y-3">
            <div>
              <GuardedButton verdict={adv} busy={busy === "adv"} onClick={() => go("adv", `Advance to ${STATUSES[adv.next ?? 0]}`, (c) => c.advanceStatus(a.id, adv.next!))}>
                <ArrowRight className="h-4 w-4" />{adv.next !== undefined ? `Advance to ${STATUSES[adv.next]}` : "No further advance"}
              </GuardedButton>
              {!adv.ok && adv.reason && <p className="mt-1.5 text-xs text-forest-800/60">{adv.reason}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="btn-secondary btn-sm" to={`/record?animal=${a.id}`}><ClipboardList className="h-3.5 w-3.5" />Record milestone / evidence</Link>
              <Link className="btn-secondary btn-sm" to={`/transfers?animal=${a.id}`}>Transfer custody</Link>
              <Link className="btn-secondary btn-sm" to={`/verify?animal=${a.id}`}><ShieldCheck className="h-3.5 w-3.5" />Verify a file</Link>
              {a.status >= 5 && <Link className="btn-secondary btn-sm" to={`/release?animal=${a.id}`}><Leaf className="h-3.5 w-3.5" />Release</Link>}
            </div>
            {account && !myOrg && <p className="text-xs text-forest-800/60">Connected wallet is not a registered organization: read-only.</p>}
            {wasCustodian && myOrg && <p className="text-xs text-forest-800/60">Your organization has held custody of this animal.</p>}
          </div>
        </Section>

        {a.status === 6 ? (
          <Section title="Release" icon={<Leaf className="h-5 w-5 text-emerald-600" />}>
            <dl className="space-y-3 text-sm">
              <div><dt className="label">Location</dt><dd>{d.releaseRecord.locationNote}</dd></div>
              <div><dt className="label">Released</dt><dd>{fmtDate(d.releaseRecord.releasedAt)}</dd></div>
              <div><dt className="label">Authorized by</dt><dd><OrgChip address={d.releaseAuth.authorizedBy} /></dd></div>
              <div><dt className="label">Permit</dt><dd><HashText hash={d.releaseAuth.permitHash} /> <CidLink cid={d.releaseAuth.permitCid} /></dd></div>
            </dl>
          </Section>
        ) : (
          <Section title="Release authorization" icon={<Leaf className="h-5 w-5 text-forest-600" />}>
            {d.releaseAuth.authorized ? (
              <div className="space-y-2 text-sm"><Notice tone="info">Authorized {fmtDate(d.releaseAuth.authorizedAt)}. Ready for release.</Notice><OrgChip address={d.releaseAuth.authorizedBy} /></div>
            ) : <p className="text-sm text-forest-800/70">{a.status === 5 ? "Awaiting authorization from a Forest Department." : "Available once the animal is Release ready."}</p>}
          </Section>
        )}
      </div>

      <Section title="Custody history" icon={<History className="h-5 w-5 text-forest-600" />}>
        {history.length === 0 ? <Empty>No completed transfers. {a.registeredBy && <>Held by the registering organization since {fmtDate(a.registeredAt)}.</>}</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-forest-700/70"><tr><th className="pb-2">#</th><th>From</th><th></th><th>To</th><th>Requested</th><th>Accepted</th><th>Document</th></tr></thead>
              <tbody className="divide-y divide-forest-900/5">
                {history.map((r, i) => (
                  <tr key={i} className="align-top"><td className="py-3 pr-2 mono">{i + 1}</td><td><OrgChip address={r.from} /></td><td className="px-2 text-forest-500"><ArrowRight className="h-4 w-4" /></td><td><OrgChip address={r.to} /></td>
                    <td className="text-xs">{fmtDate(r.requestedAt)}</td><td className="text-xs">{fmtDate(r.acceptedAt)}</td><td>{isZeroHash(r.evidenceHash) ? "—" : <HashText hash={r.evidenceHash} />}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Treatment & rehabilitation milestones" icon={<Stethoscope className="h-5 w-5 text-forest-600" />}>
        {milestones.length === 0 ? <Empty>No milestones recorded yet.</Empty> : (
          <ul className="space-y-3">
            {milestones.map((m) => {
              const v = canVerify(m, a, myOrg, account);
              return (
                <li key={m.index} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-forest-900/10 bg-white p-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-forest-100 px-2 py-0.5 text-xs font-semibold text-forest-800">{MILESTONE_TYPES[m.type]}</span>
                      {m.verified ? <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"><BadgeCheck className="h-3.5 w-3.5" />Verified</span>
                        : <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Unverified</span>}
                      <span className="text-xs text-forest-800/60">{fmtDate(m.recordedAt)}</span>
                    </div>
                    <p className="text-sm">{m.note}</p>
                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-forest-800/70">
                      <span>Recorded by <b>{orgName(m.recordedBy)}</b></span>
                      {m.verified && <span>Verified by <b>{orgName(m.verifiedBy)}</b> · {fmtDate(m.verifiedAt)}</span>}
                      {!isZeroHash(m.evidenceHash) && <span className="flex items-center gap-2">Evidence <HashText hash={m.evidenceHash} /><CidLink cid={m.cid} /></span>}
                    </div>
                  </div>
                  {!m.verified && <GuardedButton className="btn-secondary btn-sm" verdict={v} busy={busy === `v${m.index}`} onClick={() => go(`v${m.index}`, `Verify ${MILESTONE_TYPES[m.type]} milestone`, (c) => c.verifyMilestone(a.id, m.index))}><BadgeCheck className="h-3.5 w-3.5" />Verify</GuardedButton>}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Evidence on record" icon={<FileCheck2 className="h-5 w-5 text-forest-600" />} action={<Link className="text-xs font-semibold text-forest-600 hover:underline" to={`/verify?animal=${a.id}`}>Verify a file →</Link>}>
          {evidence.length === 0 ? <Empty>No evidence.</Empty> : (
            <ul className="divide-y divide-forest-900/5">
              {evidence.map((e) => (
                <li key={e.index} className="py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{e.type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span><span className="text-xs text-forest-800/60">{fmtDate(e.uploadedAt)}</span></div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs"><HashText hash={e.hash} /><CidLink cid={e.cid} /><span className="text-forest-800/60">by {orgName(e.uploadedBy)}</span></div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Full timeline" icon={<History className="h-5 w-5 text-forest-600" />}>
          <TimelineList entries={timeline} describe={describe(d)} />
        </Section>
      </div>
    </div>
  );
}

