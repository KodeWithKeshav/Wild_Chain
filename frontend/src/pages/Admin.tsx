import { useEffect, useState } from "react";
import { Building2, Grid3x3, Lock } from "lucide-react";
import { useWeb3 } from "../context/Web3Context";
import { GuardedButton, Notice, PageHeader, Section } from "../components/ui";
import { ORG_SHORT, ORG_TYPES } from "../lib/chain";
import { shortAddr } from "../lib/format";
import { isAddress } from "ethers";

export default function Admin() {
  const { isOwner, account, orgs, run, read, refreshKey } = useWeb3();
  const [addr, setAddr] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<boolean[][] | null>(null);

  useEffect(() => { read?.transferMatrix().then((m: any) => setMatrix(m.map((r: any) => Array.from(r) as boolean[]))).catch(() => setMatrix(null)); }, [read, refreshKey]);
  const owner = isOwner ? { ok: true } : { ok: false, reason: "Only the contract owner can do this." };
  const act = async (key: string, label: string, fn: Parameters<typeof run>[1]) => { setBusy(key); await run(label, fn); setBusy(null); };
  const validAddr = isAddress(addr);

  return (
    <>
      <PageHeader title="Administration" subtitle="The contract owner manages which organizations may act and which custody hand-overs are allowed." />
      {!account ? <Notice tone="warn">Connect the owner wallet to make changes. Everything below is publicly readable.</Notice>
        : !isOwner && <Notice tone="warn"><Lock className="mr-1 inline h-4 w-4" />Read-only: the connected wallet is not the contract owner.</Notice>}
      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Section title="Organizations" icon={<Building2 className="h-5 w-5 text-forest-600" />}>
            <ul className="divide-y divide-forest-900/5">
              {orgs.map((o) => (
                <li key={o.address} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div><div className="font-semibold">{o.name}</div><div className="text-xs text-forest-800/70">{ORG_TYPES[o.orgType]} · <span className="mono">{shortAddr(o.address)}</span></div></div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${o.active ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{o.active ? "Active" : "Inactive"}</span>
                    {o.active
                      ? <GuardedButton className="btn-danger btn-sm" verdict={owner} busy={busy === o.address} onClick={() => act(o.address, `Deactivate ${o.name}`, (c) => c.deactivateOrganization(o.address))}>Deactivate</GuardedButton>
                      : <GuardedButton className="btn-secondary btn-sm" verdict={owner} busy={busy === o.address} onClick={() => act(o.address, `Reactivate ${o.name}`, (c) => c.reactivateOrganization(o.address))}>Reactivate</GuardedButton>}
                  </div>
                </li>
              ))}
              {orgs.length === 0 && <li className="py-6 text-center text-sm text-forest-800/60">No organizations registered yet.</li>}
            </ul>
          </Section>
        </div>
        <form className="lg:col-span-2" onSubmit={(e) => { e.preventDefault(); act("reg", `Register ${name}`, (c) => c.registerOrganization(addr, name.trim(), type)).then(() => { setAddr(""); setName(""); }); }}>
          <Section title="Register organization">
            <div className="space-y-4">
              <div><label className="label">Wallet address</label><input className="input mono" value={addr} onChange={(e) => setAddr(e.target.value.trim())} placeholder="0x…" /></div>
              <div><label className="label">Name</label><input className="input" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nilgiri Rescue Team" /></div>
              <div><label className="label">Type</label><select className="input" value={type} onChange={(e) => setType(Number(e.target.value))}>{ORG_TYPES.map((t, i) => <option key={t} value={i}>{t}</option>)}</select></div>
              <GuardedButton type="submit" busy={busy === "reg"} verdict={!validAddr || !name.trim() ? { ok: false, reason: "Enter a valid address and a name." } : owner}>Register</GuardedButton>
            </div>
          </Section>
        </form>
      </div>

      <div className="mt-5">
        <Section title="Custody transfer matrix" icon={<Grid3x3 className="h-5 w-5 text-forest-600" />}>
          <p className="mb-4 text-sm text-forest-800/70">Rows hand custody over <i>to</i> columns. {isOwner ? "Click a cell to toggle it." : ""}</p>
          {matrix ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-separate border-spacing-1 text-center text-xs">
                <thead><tr><th className="text-left text-forest-700/70">From ↓ / To →</th>{ORG_SHORT.map((t) => <th key={t} className="px-1 pb-1 font-semibold text-forest-800">{t}</th>)}</tr></thead>
                <tbody>
                  {ORG_SHORT.map((from, f) => (
                    <tr key={from}>
                      <th className="pr-2 text-left font-semibold text-forest-800">{from}</th>
                      {ORG_SHORT.map((to, t) => {
                        const on = matrix[f][t];
                        return (
                          <td key={to}>
                            <button disabled={!isOwner || busy === `${f}-${t}`} title={`${ORG_TYPES[f]} → ${ORG_TYPES[t]}`}
                              onClick={() => act(`${f}-${t}`, `${on ? "Disallow" : "Allow"} ${from} → ${to}`, (c) => c.setTransferAllowed(f, t, !on))}
                              className={`h-10 w-full rounded-lg font-bold transition disabled:cursor-default ${on ? "bg-forest-600 text-white hover:bg-forest-700" : "bg-forest-900/[0.06] text-forest-900/25 hover:bg-forest-900/10"}`}>{on ? "✓" : "·"}</button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="h-40 animate-pulse rounded-xl bg-forest-100" />}
        </Section>
      </div>
    </>
  );
}
