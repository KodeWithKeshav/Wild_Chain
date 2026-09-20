import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Contract, JsonRpcProvider, type ContractTransactionResponse } from "ethers";
import { abi, defaultChainId, deployment, type Org } from "../lib/chain";
import { decodeError, setInterface } from "../lib/errors";
import { fetchOrgs, toOrg } from "../lib/api";
import { sameAddr } from "../lib/format";

export interface Toast { id: number; label: string; state: "pending" | "confirmed" | "failed"; hash?: string; message?: string }

/** Ganache deterministic account labels (after seeding). */
const ACCOUNT_LABELS: Record<number, string> = {
  0: "Admin / Owner",
  1: "Coastal Rescue Team",
  2: "City Veterinary Hospital",
  3: "Green Valley Rehabilitation Centre",
  4: "State Forest Department",
  5: "Wildlife Conservation Trust",
};

interface Ctx {
  account: string | null;
  accounts: string[];
  accountLabel(address: string): string;
  selectAccount(address: string): void;
  activeChainId: number;
  read: Contract | null;
  write: Contract | null;
  deployed: boolean;
  myOrg: Org | null;
  isOwner: boolean;
  orgs: Org[];
  orgName(address: string): string;
  refreshKey: number;
  refresh(): void;
  toasts: Toast[];
  dismissToast(id: number): void;
  /** Sends a transaction, shows pending/confirmed/failed toasts, refreshes data. */
  run(label: string, send: (c: Contract) => Promise<ContractTransactionResponse>): Promise<import("ethers").ContractTransactionReceipt | null>;
}

const Web3Ctx = createContext<Ctx>(null as unknown as Ctx);
export const useWeb3 = () => useContext(Web3Ctx);

export function Web3Provider({ children }: { children: ReactNode }) {
  const rpcUrl = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:7545";
  const chainId = defaultChainId();
  const dep = deployment(chainId);

  const provider = useMemo(() => new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true }), [rpcUrl, chainId]);

  const [accounts, setAccounts] = useState<string[]>([]);
  const [account, setAccount] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [myOrg, setMyOrg] = useState<Org | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const read = useMemo(() => (dep ? new Contract(dep.address, abi, provider) : null), [dep, provider]);
  const [write, setWrite] = useState<Contract | null>(null);

  useEffect(() => { if (read) setInterface(read.interface); }, [read]);

  // Fetch Ganache accounts on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const signers = await provider.listAccounts();
        const addrs = signers.map((s) => s.address);
        if (!cancelled) {
          setAccounts(addrs);
          // Auto-select the first account (admin)
          if (addrs.length > 0) setAccount(addrs[0]);
        }
      } catch {
        if (!cancelled) setAccounts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [provider]);

  // Create signer-bound write contract when account changes
  useEffect(() => {
    let cancelled = false;
    if (!account || !dep) { setWrite(null); return; }
    (async () => {
      try {
        const signer = await provider.getSigner(account);
        if (!cancelled) setWrite(new Contract(dep.address, abi, signer));
      } catch { if (!cancelled) setWrite(null); }
    })();
    return () => { cancelled = true; };
  }, [provider, account, dep]);

  // Org directory + connected org + owner
  useEffect(() => {
    let cancelled = false;
    if (!read) { setOrgs([]); setMyOrg(null); setOwner(null); return; }
    (async () => {
      try {
        const [list, o] = await Promise.all([fetchOrgs(read), read.owner()]);
        if (cancelled) return;
        setOrgs(list);
        setOwner(o);
        if (account) {
          const raw = await read.getOrganization(account);
          if (!cancelled) setMyOrg(raw.registered ? toOrg(account, raw) : null);
        } else setMyOrg(null);
      } catch { if (!cancelled) { setOrgs([]); setMyOrg(null); } }
    })();
    return () => { cancelled = true; };
  }, [read, account, refreshKey]);

  const selectAccount = useCallback((address: string) => {
    setAccount(address);
    setRefreshKey((k) => k + 1);
  }, []);

  const accountLabel = useCallback((address: string) => {
    const idx = accounts.findIndex((a) => sameAddr(a, address));
    return ACCOUNT_LABELS[idx] ?? `Account #${idx}`;
  }, [accounts]);

  const orgMap = useMemo(() => new Map(orgs.map((o) => [o.address.toLowerCase(), o])), [orgs]);
  const orgName = useCallback((a: string) => orgMap.get(a.toLowerCase())?.name ?? (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—"), [orgMap]);

  const patchToast = (id: number, p: Partial<Toast>) => setToasts((t) => t.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const run: Ctx["run"] = useCallback(async (label, send) => {
    if (!write) { setToasts((t) => [...t, { id: ++toastId.current, label, state: "failed", message: "Select an account first." }]); return null; }
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, label, state: "pending" }]);
    try {
      const tx = await send(write);
      patchToast(id, { hash: tx.hash });
      const receipt = await tx.wait();
      patchToast(id, { state: "confirmed", hash: tx.hash });
      setRefreshKey((k) => k + 1);
      setTimeout(() => dismissToast(id), 9000);
      return receipt;
    } catch (err) {
      patchToast(id, { state: "failed", message: decodeError(err) });
      return null;
    }
  }, [write, dismissToast]);

  const value: Ctx = {
    account, accounts, accountLabel, selectAccount, activeChainId: chainId, read, write,
    deployed: !!dep, myOrg, isOwner: sameAddr(owner, account), orgs, orgName, refreshKey,
    refresh: () => setRefreshKey((k) => k + 1), toasts, dismissToast, run,
  };
  return <Web3Ctx.Provider value={value}>{children}</Web3Ctx.Provider>;
}
