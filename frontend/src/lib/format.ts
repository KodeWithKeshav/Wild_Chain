export const shortAddr = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const shortHash = (h: string) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");
export const isZeroAddr = (a: string) => !a || /^0x0{40}$/i.test(a);
export const sameAddr = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const fmtDate = (ts: number) =>
  ts ? new Date(ts * 1000).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtDay = (ts: number) => (ts ? new Date(ts * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

export function speciesEmoji(species: string): string {
  const s = species.toLowerCase();
  const map: [RegExp, string][] = [
    [/deer|antelope|elk|stag/, "🦌"], [/eagle|hawk|falcon|owl|vulture|kite|bird/, "🦅"], [/tiger/, "🐅"], [/leopard|panther|cheetah|jaguar/, "🐆"],
    [/lion/, "🦁"], [/elephant/, "🐘"], [/rhino/, "🦏"], [/bear/, "🐻"], [/wolf|fox|jackal/, "🐺"], [/monkey|macaque|langur|ape/, "🐒"],
    [/turtle|tortoise/, "🐢"], [/snake|python|cobra/, "🐍"], [/crocodile|gharial|alligator/, "🐊"], [/otter/, "🦦"], [/pangolin/, "🦔"],
  ];
  return map.find(([r]) => r.test(s))?.[1] ?? "🐾";
}
