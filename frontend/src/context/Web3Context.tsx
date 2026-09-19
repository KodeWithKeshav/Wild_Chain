import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, type ContractTransactionResponse, type Eip1193Provider, type Provider } from "ethers";
import { NETWORKS, abi, defaultChainId, deployment, supportedChainIds, type Org } from "../lib/chain";
import { decodeError, setInterface } from "../lib/errors";
import { fetchOrgs, toOrg } from "../lib/api";
import { sameAddr } from "../lib/format";

export interface Toast { id: number; label: string; state: "pending" | "confirmed" | "failed"; hash?: string; message?: string }

interface Ctx {
  account: string | null;
  chainId: number | null;          // wallet's chain (null if no wallet)
  activeChainId: number;           // chain the app reads from
  wrongNetwork: boolean;
  hasWallet: boolean;
  connecting: boolean;
  connect(): Promise<void>;
  switchNetwork(chainId: number): Promise<void>;
  read: Contract | null;           // read-only contract
  write: Contract | null;          // signer-bound contract (null until connected on right chain)
  deployed: boolean;
  myOrg: Org | null;
  isOwner: boolean;
  orgs: Org[];
  orgName(address: string): string;
  refreshKey: number;
  refresh(): void;
  toasts: Toast[];
  dismissToast(id: number): void;
  /** Sends a transaction, shows pending/confirmed/failed toasts, refreshes data. Returns the receipt or null on failure. */
  run(label: string, send: (c: Contract) => Promise<ContractTransactionResponse>): Promise<import("ethers").ContractTransactionReceipt | null>;
  explorerTx(hash: string): string | null;
}

const Web3Ctx = createContext<Ctx>(null as unknown as Ctx);
export const useWeb3 = () => useContext(Web3Ctx);

const eth = (): Eip1193Provider | undefined => (window as any).ethereum;
const hex = (n: number) => "0x" + n.toString(16);

export function Web3Provider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [signerProvider, setSignerProvider] = useState<BrowserProvider | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [myOrg, setMyOrg] = useState<Org | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const hasWallet = !!eth();
  const supported = supportedChainIds();
  const wrongNetwork = chainId != null && !supported.includes(chainId);
  const activeChainId = chainId != null && supported.includes(chainId) ? chainId : defaultChainId();
  const dep = deployment(activeChainId);

  // Read-only provider: the wallet when on a supported chain, otherwise the configured RPC.
  const readProvider = useMemo<Provider>(() => {
    if (signerProvider && chainId === activeChainId) return signerProvider;
    return new JsonRpcProvider(NETWORKS[activeChainId]?.rpcUrl ?? "http://127.0.0.1:7545", activeChainId, { staticNetwork: true });
  }, [signerProvider, chainId, activeChainId]);

  const read = useMemo(() => (dep ? new Contract(dep.address, abi, readProvider) : null), [dep, readProvider]);
  const [write, setWrite] = useState<Contract | null>(null);

  useEffect(() => { if (read) setInterface(read.interface); }, [read]);

  // Signer-bound contract
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!signerProvider || !account || !dep || chainId !== activeChainId) return setWrite(null);
      const signer = await signerProvider.getSigner(account);
      if (!cancelled) setWrite(new Contract(dep.address, abi, signer));
    })().catch(() => setWrite(null));
    return () => { cancelled = true; };
  }, [signerProvider, account, dep, chainId, activeChainId]);

  // Wallet events
  const syncWallet = useCallback(async () => {
    const e = eth();
    if (!e) return;
    const bp = new BrowserProvider(e, "any");
    setSignerProvider(bp);
    const accounts: string[] = await e.request({ method: "eth_accounts" });
    setAccount(accounts[0] ?? null);
    setChainId(Number(await e.request({ method: "eth_chainId" })));
  }, []);

  useEffect(() => {
    const e = eth() as any;
    if (!e) return;
    syncWallet().catch(() => {});
    const onAccounts = (a: string[]) => { setAccount(a[0] ?? null); setRefreshKey((k) => k + 1); };
    const onChain = (c: string) => { setChainId(Number(c)); setSignerProvider(new BrowserProvider(e, "any")); setRefreshKey((k) => k + 1); };
    e.on?.("accountsChanged", onAccounts);
    e.on?.("chainChanged", onChain);
    return () => { e.removeListener?.("accountsChanged", onAccounts); e.removeListener?.("chainChanged", onChain); };
  }, [syncWallet]);

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

  const connect = useCallback(async () => {
    const e = eth();
    if (!e) return;
    setConnecting(true);
    try {
      await e.request({ method: "eth_requestAccounts" });
      await syncWallet();
    } finally { setConnecting(false); }
  }, [syncWallet]);

  const switchNetwork = useCallback(async (target: number) => {
    const e = eth();
    const net = NETWORKS[target];
    if (!e || !net) return;
    try {
      await e.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex(target) }] });
    } catch (err: any) {
      if (err?.code === 4902 || err?.code === -32603 || /unrecognized|not added/i.test(err?.message ?? "")) {
        await e.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: hex(target), chainName: net.name, rpcUrls: [net.rpcUrl], nativeCurrency: { name: net.currency, symbol: net.currency, decimals: 18 }, blockExplorerUrls: net.explorer ? [net.explorer] : undefined }],
        });
      } else throw err;
    }
  }, []);

  const orgMap = useMemo(() => new Map(orgs.map((o) => [o.address.toLowerCase(), o])), [orgs]);
  const orgName = useCallback((a: string) => orgMap.get(a.toLowerCase())?.name ?? (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—"), [orgMap]);

  const explorerTx = useCallback((hash: string) => {
    const ex = NETWORKS[activeChainId]?.explorer;
    return ex ? `${ex}/tx/${hash}` : null;
  }, [activeChainId]);

  const patchToast = (id: number, p: Partial<Toast>) => setToasts((t) => t.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const run: Ctx["run"] = useCallback(async (label, send) => {
    if (!write) { setToasts((t) => [...t, { id: ++toastId.current, label, state: "failed", message: "Connect your wallet on a supported network first." }]); return null; }
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
    account, chainId, activeChainId, wrongNetwork, hasWallet, connecting, connect, switchNetwork, read, write,
    deployed: !!dep, myOrg, isOwner: sameAddr(owner, account), orgs, orgName, refreshKey,
    refresh: () => setRefreshKey((k) => k + 1), toasts, dismissToast, run, explorerTx,
  };
  return <Web3Ctx.Provider value={value}>{children}</Web3Ctx.Provider>;
}
