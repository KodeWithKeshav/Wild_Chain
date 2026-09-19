import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, CheckCircle2, ExternalLink, Loader2, X, XCircle, Copy } from "lucide-react";
import { EVENT_TYPES, MILESTONE_TYPES, ORG_TYPES, STATUSES, Status } from "../lib/chain";
import { fmtDate, shortAddr, shortHash } from "../lib/format";
import { useWeb3 } from "../context/Web3Context";
import { gatewayUrl } from "../lib/storage";

const STATUS_STYLE = [
  "bg-amber-100 text-amber-900 ring-amber-300", "bg-orange-100 text-orange-900 ring-orange-300", "bg-rose-100 text-rose-900 ring-rose-300",
  "bg-lime-100 text-lime-900 ring-lime-300", "bg-teal-100 text-teal-900 ring-teal-300", "bg-sky-100 text-sky-900 ring-sky-300",
  "bg-emerald-600 text-white ring-emerald-700",
];
export const StatusBadge = ({ status }: { status: number }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[status]}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
    {STATUSES[status]}
  </span>
);

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="rise mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold text-forest-900 sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-forest-800/70">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export const Section = ({ title, icon, children, action }: { title: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) => (
  <section className="card rise p-5">
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-forest-900">{icon}{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-dashed border-forest-900/15 bg-forest-50/50 px-4 py-6 text-center text-sm text-forest-800/60">{children}</div>
);

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const c = { info: "border-sky-200 bg-sky-50 text-sky-900", warn: "border-amber-300 bg-amber-50 text-amber-900", error: "border-rose-300 bg-rose-50 text-rose-900" }[tone];
  return <div className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${c}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div>{children}</div></div>;
}

export function Copyable({ value, children }: { value: string; children: ReactNode }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" title="Copy" className="group inline-flex items-center gap-1 hover:text-forest-600"
      onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }}>
      {children}
      {done ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />}
    </button>
  );
}

/** Organization name + type; falls back to a short address. */
export function OrgChip({ address }: { address: string }) {
  const { orgs, orgName } = useWeb3();
  const org = orgs.find((o) => o.address.toLowerCase() === address.toLowerCase());
  return (
    <span className="inline-flex flex-col leading-tight" title={address}>
      <span className="font-medium text-forest-900">{orgName(address)}</span>
      <span className="mono text-forest-700/60">{org ? `${ORG_TYPES[org.orgType]} · ` : ""}{shortAddr(address)}</span>
    </span>
  );
}

export const HashText = ({ hash }: { hash: string }) => <Copyable value={hash}><span className="mono text-forest-800/80">{shortHash(hash)}</span></Copyable>;

export const CidLink = ({ cid }: { cid: string }) =>
  cid ? (
    cid.startsWith("offline-demo-") ? <span className="mono text-forest-800/50" title="Placeholder CID: seeded while no IPFS daemon was running">{cid.slice(0, 20)}… (offline demo)</span> :
    <a href={gatewayUrl(cid)} target="_blank" rel="noreferrer" className="mono inline-flex items-center gap-1 text-forest-600 hover:underline">{cid.slice(0, 14)}…<ExternalLink className="h-3 w-3" /></a>
  ) : <span className="text-forest-800/40">—</span>;

/** Button that explains, on hover, why it is disabled. */
export function GuardedButton({ verdict, children, onClick, busy, className = "btn-primary", type = "button" }: {
  verdict?: { ok: boolean; reason?: string }; children: ReactNode; onClick?: () => void; busy?: boolean; className?: string; type?: "button" | "submit";
}) {
  const disabled = busy || (verdict ? !verdict.ok : false);
  return (
    <span title={verdict && !verdict.ok ? verdict.reason : undefined} className="inline-flex">
      <button type={type} disabled={disabled} onClick={onClick} className={className}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}{children}
      </button>
    </span>
  );
}

export function LifecycleStepper({ status }: { status: number }) {
  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:items-start">
      {STATUSES.map((label, i) => {
        const done = i < status || status === Status.RELEASED;
        const current = i === status && status !== Status.RELEASED;
        return (
          <li key={label} className="relative flex flex-1 items-center gap-3 pb-4 sm:flex-col sm:pb-0 sm:text-center">
            {i > 0 && <span className={`absolute left-[15px] top-[-16px] h-4 w-0.5 sm:left-[-50%] sm:top-[15px] sm:h-0.5 sm:w-full ${i <= status ? "bg-forest-500" : "bg-forest-900/10"}`} />}
            <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2 transition ${
              done ? "bg-forest-600 text-white ring-forest-600" : current ? "bg-white text-forest-700 ring-forest-500 pulse-ring" : "bg-white text-forest-900/30 ring-forest-900/10"}`}>
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={`text-xs sm:mt-2 sm:px-1 ${current ? "font-semibold text-forest-800" : done ? "text-forest-700" : "text-forest-900/40"}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function TimelineList({ entries, describe }: { entries: { eventType: number; actor: string; timestamp: number; refIndex: number }[]; describe: (e: { eventType: number; refIndex: number }) => string }) {
  return (
    <ol className="relative ml-2 border-l-2 border-forest-200 pl-5">
      {entries.map((e, i) => (
        <li key={i} className="relative pb-5 last:pb-0">
          <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-forest-500 ring-2 ring-forest-200" />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-semibold text-forest-900">{EVENT_TYPES[e.eventType]}</span>
            <time className="text-xs text-forest-800/60">{fmtDate(e.timestamp)}</time>
          </div>
          <div className="text-sm text-forest-800/75">{describe(e)}</div>
          <div className="mt-0.5 text-xs text-forest-800/60"><OrgChip address={e.actor} /></div>
        </li>
      ))}
    </ol>
  );
}
export { MILESTONE_TYPES };

export function AnimalPicker({ animals, value, onChange, label = "Animal" }: { animals: { id: number; species: string; status: number }[]; value: number | null; onChange: (id: number | null) => void; label?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Select an animal…</option>
        {animals.map((a) => <option key={a.id} value={a.id}>#{a.id} · {a.species} · {STATUSES[a.status]}</option>)}
      </select>
    </div>
  );
}

export function ToastHost() {
  const { toasts, dismissToast, explorerTx } = useWeb3();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2">
      {toasts.map((t) => {
        const link = t.hash ? explorerTx(t.hash) : null;
        return (
          <div key={t.id} className="pointer-events-auto rise flex items-start gap-3 rounded-xl border border-forest-900/10 bg-white p-3.5 shadow-xl">
            {t.state === "pending" && <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-forest-600" />}
            {t.state === "confirmed" && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />}
            {t.state === "failed" && <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />}
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold text-forest-900">{t.label}</div>
              <div className="text-forest-800/70">
                {t.state === "pending" && (t.hash ? "Waiting for confirmation…" : "Confirm in your wallet…")}
                {t.state === "confirmed" && "Confirmed on-chain"}
                {t.state === "failed" && t.message}
              </div>
              {t.hash && <div className="mono mt-1 text-forest-700/60">{link ? <a className="inline-flex items-center gap-1 text-forest-600 hover:underline" href={link} target="_blank" rel="noreferrer">{shortHash(t.hash)}<ExternalLink className="h-3 w-3" /></a> : shortHash(t.hash)}</div>}
            </div>
            <button onClick={() => dismissToast(t.id)} className="text-forest-900/40 hover:text-forest-900"><X className="h-4 w-4" /></button>
          </div>
        );
      })}
    </div>
  );
}

export const BackLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-forest-600 hover:underline">← {children}</Link>
);
