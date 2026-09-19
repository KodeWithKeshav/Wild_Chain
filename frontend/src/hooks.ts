import { useEffect, useState } from "react";
import { useWeb3 } from "./context/Web3Context";
import { fetchAnimalDetail, fetchAnimals } from "./lib/api";
import type { Animal, AnimalDetail } from "./lib/chain";
import { decodeError } from "./lib/errors";

interface Loaded<T> { data: T | null; loading: boolean; error: string | null }

export function useAnimals(): Loaded<Animal[]> {
  const { read, refreshKey } = useWeb3();
  const [s, set] = useState<Loaded<Animal[]>>({ data: null, loading: true, error: null });
  useEffect(() => {
    if (!read) return set({ data: [], loading: false, error: null });
    let off = false;
    fetchAnimals(read).then((data) => !off && set({ data, loading: false, error: null }), (e) => !off && set({ data: null, loading: false, error: decodeError(e) }));
    return () => { off = true; };
  }, [read, refreshKey]);
  return s;
}

export function useAnimalDetail(id: number | null): Loaded<AnimalDetail> & { wasCustodian: boolean } {
  const { read, refreshKey, account } = useWeb3();
  const [s, set] = useState<Loaded<AnimalDetail>>({ data: null, loading: !!id, error: null });
  const [was, setWas] = useState(false);
  useEffect(() => {
    if (!read || !id) { set({ data: null, loading: false, error: null }); setWas(false); return; }
    let off = false;
    Promise.all([fetchAnimalDetail(read, id), account ? read.wasCustodian(id, account) : Promise.resolve(false)]).then(
      ([data, w]) => { if (!off) { set({ data, loading: false, error: null }); setWas(!!w); } },
      (e) => !off && set({ data: null, loading: false, error: decodeError(e) }),
    );
    return () => { off = true; };
  }, [read, id, refreshKey, account]);
  return { ...s, wasCustodian: was };
}
