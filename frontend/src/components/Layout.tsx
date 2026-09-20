import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ArrowLeftRight, BadgeCheck, ClipboardPlus, LayoutDashboard, Menu, PawPrint, PlusCircle, Settings2, ShieldCheck, Sprout, Users, X } from "lucide-react";
import { useWeb3 } from "../context/Web3Context";
import { ORG_TYPES } from "../lib/chain";
import { shortAddr } from "../lib/format";
import { Notice, ToastHost } from "./ui";
import { evidenceStore } from "../lib/storage";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/register", label: "Register animal", icon: PlusCircle },
  { to: "/transfers", label: "Transfers", icon: ArrowLeftRight },
  { to: "/record", label: "Milestones & evidence", icon: ClipboardPlus },
  { to: "/release", label: "Release", icon: Sprout },
  { to: "/verify", label: "Verify evidence", icon: ShieldCheck },
  { to: "/admin", label: "Admin", icon: Settings2 },
];

function AccountSwitcher() {
  const w = useWeb3();

  if (w.accounts.length === 0) {
    return <div className="rounded-xl bg-white/10 p-3 text-xs text-forest-100">Connecting to Ganache…</div>;
  }

  return (
    <div className="space-y-2 rounded-xl bg-white/10 p-3 text-forest-50">
      <div className="flex items-center gap-2 text-xs font-semibold text-forest-200 uppercase tracking-wider">
        <Users className="h-3.5 w-3.5" />Switch account
      </div>
      <select
        className="w-full rounded-lg bg-white/10 px-2.5 py-2 text-sm text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
        value={w.account ?? ""}
        onChange={(e) => w.selectAccount(e.target.value)}
      >
        {w.accounts.map((addr) => (
          <option key={addr} value={addr} className="bg-forest-900 text-white">
            {w.accountLabel(addr)} ({shortAddr(addr)})
          </option>
        ))}
      </select>
      {w.account && (
        <div className="space-y-1 pt-1">
          <div className="mono flex items-center gap-2 text-forest-100">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />{shortAddr(w.account)}
          </div>
          {w.myOrg ? (
            <div className="text-sm">
              <div className="flex items-center gap-1.5 font-semibold"><BadgeCheck className="h-4 w-4 text-emerald-300" />{w.myOrg.name}</div>
              <div className="text-xs text-forest-200">{ORG_TYPES[w.myOrg.orgType]} · {w.myOrg.active ? "Active" : <span className="text-amber-300">Deactivated</span>}</div>
            </div>
          ) : <div className="text-xs text-amber-200">{w.isOwner ? "Contract owner (admin)" : "Not a registered organization."}</div>}
          {w.isOwner && w.myOrg && <div className="text-xs text-sand-300">Also contract owner</div>}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const w = useWeb3();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="flex flex-col gap-1">
      {links.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
          className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-white/15 text-white" : "text-forest-100/80 hover:bg-white/10 hover:text-white"}`}>
          <Icon className="h-4 w-4" />{label}
        </NavLink>
      ))}
    </nav>
  );
  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sand-200 text-forest-800"><PawPrint className="h-6 w-6" /></div>
        <div className="leading-tight"><div className="font-display text-xl font-bold text-white">Wild Chain</div><div className="text-xs text-forest-200">Chain of custody</div></div>
      </div>
      {nav}
      <div className="mt-auto space-y-3"><AccountSwitcher /><div className="text-[11px] leading-snug text-forest-300/70">Evidence store: {evidenceStore.name} · Ganache (local)</div></div>
    </div>
  );
  return (
    <div className="min-h-screen lg:pl-72">
      <aside className="fixed inset-y-0 left-0 hidden w-72 bg-forest-900 lg:block" style={{ backgroundImage: "radial-gradient(circle at 20% 0%, rgba(95,160,117,.35), transparent 45%), radial-gradient(circle at 100% 100%, rgba(12,28,18,.9), transparent 60%)" }}>{sidebar}</aside>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-forest-900 px-4 py-3 text-white lg:hidden">
        <div className="flex items-center gap-2 font-display text-lg font-bold"><PawPrint className="h-5 w-5 text-sand-300" />Wild Chain</div>
        <button onClick={() => setOpen(true)} aria-label="Menu"><Menu className="h-6 w-6" /></button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-forest-900">
            <button className="absolute right-3 top-3 text-white" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>{sidebar}
          </div>
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        {!w.deployed && <div className="mb-5"><Notice tone="error">No contract deployment found. Run <code className="mono">start.bat</code> to deploy the contracts.</Notice></div>}
        <Outlet />
      </main>
      <ToastHost />
    </div>
  );
}
