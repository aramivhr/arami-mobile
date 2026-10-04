// Seeded random generator so every generated test case is the same on every run.
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)];
  const bool = (p = 0.5) => next() < p;
  const iso = (fromYear = 2024, toYear = 2028) => {
    const d = new Date(Date.UTC(int(fromYear, toYear), int(0, 11), int(1, 28)));
    d.setUTCDate(d.getUTCDate() + int(0, 3));
    return d.toISOString().slice(0, 10);
  };
  const str = (max = 12) => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.@<>&\"'éñ中🙂";
    return Array.from({ length: int(0, max) }, () => pick([...chars])).join("");
  };
  return { next, int, pick, bool, iso, str };
}

/** n distinct generated cases; a case's label must be unique, so duplicates are dropped and regenerated. */
export function cases<T>(
  n: number,
  seed: number,
  make: (r: ReturnType<typeof rng>, i: number) => T,
  label: (c: T) => string = (c) => JSON.stringify(c),
): [string, T][] {
  const r = rng(seed);
  const out = new Map<string, T>();
  let guard = 0;
  while (out.size < n) {
    const c = make(r, out.size);
    const l = label(c);
    if (!out.has(l)) out.set(l, c);
    if (++guard > n * 50) throw new Error(`could only make ${out.size} unique cases`);
  }
  return [...out].map(([l, c], i) => [`#${i + 1} ${l.length > 90 ? l.slice(0, 90) + "…" : l}`, c]);
}
