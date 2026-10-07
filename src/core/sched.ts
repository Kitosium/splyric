import { PRS_MS, TICK_MS } from "../config/const.ts";
import { gst } from "./state.ts";
import { mono } from "../utils/time.ts";
import type { Clk, Sch } from "../types/typ.ts";

export const mkSch = (clk: Clk, tk: () => void): Sch => {
  let tm: ReturnType<typeof setTimeout> | null = null;

  const cs = (now: number, p: number, r: number, ep: number): number => {
    const m = now + (ep - p) / r;
    return m > now + 1 ? m : Infinity;
  };

  const af = (now: number, at: number, d: number, gap: number): number => {
    const age = now - at;
    return age < d ? now + Math.min(gap, d - age + 30) : Infinity;
  };

  const nxt = (): number => {
    const s = gst();
    const now = mono();
    let best = Infinity;
    if (s.tst) best = Math.min(best, af(now, s.tst.at, s.tst.d, TICK_MS));
    if (s.prs) best = Math.min(best, af(now, s.prs.at, PRS_MS, 40));
    if (s.ldg) best = Math.min(best, now + 80);
    if (!s.ply || !s.ply.ply) return best;
    const r = clk.rat();
    if (r <= 0) return best;
    const p = clk.pos(now);
    const off = clk.getO();
    best = Math.min(best, now + TICK_MS);
    const l = s.lyr;
    if (l) {
      for (const ln of l.ln) {
        best = Math.min(best, cs(now, p, r, ln.t - off));
        for (const w of ln.w) best = Math.min(best, cs(now, p, r, w.t - off));
      }
    }
    return best;
  };

  const run = (): void => {
    if (tm) clearTimeout(tm);
    const nx = nxt();
    if (nx === Infinity) return;
    tm = setTimeout(
      () => {
        tk();
        run();
      },
      Math.max(0, nx - mono()),
    );
  };

  const wake = (): void => {
    if (tm) {
      clearTimeout(tm);
      tm = null;
    }
    tk();
    run();
  };

  const stp = (): void => {
    if (tm) clearTimeout(tm);
    tm = null;
  };

  return { wake, stp };
};
