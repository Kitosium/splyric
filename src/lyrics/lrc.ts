import type { Lne, Lyr, Wrd } from "../types/typ.ts";

const TGR = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const DEF_SP = 4000;

export const pseLrc = (t: string): Lne[] => {
  const out: Lne[] = [];
  for (const raw of t.split("\n")) {
    const ts: number[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    TGR.lastIndex = 0;
    while ((m = TGR.exec(raw))) {
      const fr = (m[3] ?? "0").padEnd(3, "0").slice(0, 3);
      ts.push(Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number(fr));
      last = TGR.lastIndex;
    }
    const s = raw.slice(last).trim();
    if (!s) continue;
    for (const t0 of ts) out.push({ t: t0, s, w: [] });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
};

export const itp = (ln: Lne[]): Lne[] => {
  const out: Lne[] = [];
  for (let i = 0; i < ln.length; i++) {
    const c = ln[i]!;
    const wds = c.s.split(/\s+/).filter(Boolean);
    if (wds.length && c.w.length === wds.length) {
      out.push(c);
      continue;
    }
    const nx = ln[i + 1];
    const end = Math.max(c.t + 1, nx ? nx.t : c.t + DEF_SP);
    if (!wds.length) {
      out.push({ ...c, w: [] });
      continue;
    }
    const tot = wds.reduce((a, w) => a + w.length + 1, 0);
    let cum = 0;
    const w: Wrd[] = [];
    for (let k = 0; k < wds.length; k++) {
      const wd = wds[k]!;
      const t = Math.min(c.t + Math.round(((end - c.t) * cum) / tot), end - 1);
      w.push({ t, s: k === wds.length - 1 ? wd : `${wd} ` });
      cum += wd.length + 1;
    }
    out.push({ ...c, w });
  }
  return out;
};

export const bldL = (ln: Lne[], src: string, wrd: boolean): Lyr => {
  const xs = [...ln].sort((a, b) => a.t - b.t);
  const out = (wrd ? xs : itp(xs)).map((l) => ({
    ...l,
    w: [...l.w].sort((a, b) => a.t - b.t),
  }));
  return { ln: out, src, wrd };
};
