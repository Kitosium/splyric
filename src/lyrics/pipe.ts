import { cfg } from "../config/env.ts";
import { logErr, logWrn } from "../errors/log.ts";
import { gLyr, sLyr } from "./cache.ts";
import { fchLrc } from "./lrclib.ts";
import { fchMxm } from "./mxm.ts";
import { fchSpot } from "./spot.ts";
import { fchYtc } from "./ytc.ts";
import type { Lyr, Ply } from "../types/typ.ts";

const one = async (n: string, p: Ply): Promise<Lyr | null> => {
  if (n === "lrclib") return fchLrc(p);
  if (n === "mxm") return fchMxm(p);
  if (n === "spot") return fchSpot(p);
  if (n === "ytc") return fchYtc(p);
  logWrn("pipe", `unknown source: ${n}`);
  return null;
};

export const bldLyr = async (p: Ply): Promise<Lyr | null> => {
  const c = gLyr(p.id);
  if (c) return c;
  let ln: Lyr | null = null;
  for (const n of cfg.src) {
    try {
      const r = await one(n, p);
      if (!r) continue;
      if (r.wrd) {
        sLyr(p.id, r);
        return r;
      }
      ln = ln ?? r;
    } catch (e) {
      logErr("pipe", e);
    }
  }
  if (ln) {
    sLyr(p.id, ln);
    return ln;
  }
  return null;
};
