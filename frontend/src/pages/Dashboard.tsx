import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Hourglass, PawPrint, RefreshCw, Sprout } from "lucide-react";
import { useAnimals } from "../hooks";
import { useWeb3 } from "../context/Web3Context";
import { STATUSES, Status } from "../lib/chain";
import { fmtDay, isZeroAddr, sameAddr, speciesEmoji } from "../lib/format";
import { Empty, Notice, PageHeader, StatusBadge } from "../components/ui";

export default function Dashboard() {
  const { data: animals, loading, error } = useAnimals();
  const { orgName, account, refresh } = useWeb3();
  const [filter, setFilter] = useState<number | "all" | "mine">("all");

  const list = animals ?? [];
  const shown = list.filter((a) => (filter === "all" ? true : filter === "mine" ? sameAddr(a.currentCustodian, account) : a.status === filter)).slice().reverse();
  const stats = [
    { label: "Animals registered", value: list.length, icon: PawPrint },
    { label: "In care", value: list.filter((a) => a.status < Status.RELEASED).length, icon: Activity },
    { label: "Awaiting acceptance", value: list.filter((a) => !isZeroAddr(a.pendingTransferTo)).length, icon: Hourglass },
    { label: "Released to the wild", value: list.filter((a) => a.status === Status.RELEASED).length, icon: Sprout },
  ];

  return (
    <>
      <PageHeader title="Rescued animals" subtitle="Every animal has one on-chain identity and a complete, tamper-resistant custody history.">
        <button className="btn-secondary btn-sm" onClick={refresh}><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="card rise flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-forest-100 text-forest-700"><Icon className="h-5 w-5" /></div>
            <div><div className="font-display text-2xl font-bold leading-none">{value}</div><div className="mt-1 text-xs text-forest-800/70">{label}</div></div>
          </div>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {([["all", "All"], ...(account ? [["mine", "My custody"]] : []), ...STATUSES.map((s, i) => [i, s])] as [number | "all" | "mine", string][]).map(([k, label]) => (
          <button key={String(k)} onClick={() => setFilter(k)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${filter === k ? "bg-forest-700 text-white ring-forest-700" : "bg-white text-forest-800 ring-forest-900/15 hover:bg-forest-50"}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {loading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="card h-40 animate-pulse" />)}</div>}
      {!loading && !error && shown.length === 0 && <Empty>{list.length === 0 ? <>No animals registered yet. <Link className="font-semibold text-forest-600 underline" to="/register">Register the first one</Link>.</> : "No animals match this filter."}</Empty>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((a) => (
          <Link key={a.id} to={`/animals/${a.id}`} className="card rise group p-5 transition hover:-translate-y-0.5 hover:shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sand-100 text-2xl">{speciesEmoji(a.species)}</div>
                <div><div className="font-display text-lg font-bold leading-tight text-forest-900">{a.species}</div><div className="mono text-forest-700/60">ID #{a.id}</div></div>
              </div>
              <StatusBadge status={a.status} />
            </div>
            <div className="mb-3 flex gap-0.5">{STATUSES.map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= a.status ? "bg-forest-500" : "bg-forest-900/10"}`} />)}</div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-forest-800/60">Custodian</dt><dd className="text-right font-medium">{orgName(a.currentCustodian)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-forest-800/60">Registered</dt><dd>{fmtDay(a.registeredAt)}</dd></div>
              {!isZeroAddr(a.pendingTransferTo) && <div className="flex justify-between gap-2"><dt className="text-amber-700">Transfer pending to</dt><dd className="text-right font-medium text-amber-800">{orgName(a.pendingTransferTo)}</dd></div>}
            </dl>
          </Link>
        ))}
      </div>
    </>
  );
}
