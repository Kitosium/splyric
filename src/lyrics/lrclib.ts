import { parse } from "yaml";
import { LRCL } from "../config/const.ts";
import { logErr, logWrn } from "../errors/log.ts";
import { hOk, req } from "../utils/http.ts";
import { bldL, pseLrc } from "./lrc.ts";
import type { Lne, Lyr, Ply } from "../types/typ.ts";

type Yw = { text?: string; start_ms?: number };
type Yln = { text?: string; start_ms?: number; words?: Yw[] };
type Yl = { lines?: Yln[] };

type Lr = {
  id?: number;
  instrumental?: boolean;
  hasWordSync?: boolean;
  lyricsfile?: string | null;
  syncedLyrics?: string | null;
  duration?: number;
  name?: string;
  trackName?: string;
  artistName?: string;
};

const pseYml = (b: string): Lne[] => {
  const y = parse(b) as Yl;
  const out: Lne[] = [];
  for (const l of y.lines ?? []) {
    const s = (l.text ?? "").trim();
    if (!s) continue;
    out.push({
      t: l.start_ms ?? 0,
      s,
      w: (l.words ?? [])
        .filter((w) => w.text != null && w.start_ms != null)
        .map((w) => ({ t: w.start_ms!, s: w.text! })),
    });
  }
  out.sort((a, b2) => a.t - b2.t);
  return out;
};

const gt = async (q: URLSearchParams): Promise<Lr | null> => {
  const u = `${LRCL}/get?${q}`;
  const r = await req(u);
  if (r.cd === 404) return null;
  hOk(r, u);
  try {
    return JSON.parse(r.bd) as Lr;
  } catch (e) {
    logErr("lrclib", e);
    return null;
  }
};

const sch = async (q: string): Promise<Lr[]> => {
  const u = `${LRCL}/search?q=${encodeURIComponent(q)}`;
  const r = await req(u);
  if (r.cd === 404) return [];
  hOk(r, u);
  try {
    return JSON.parse(r.bd) as Lr[];
  } catch (e) {
    logErr("lrclib", e);
    return [];
  }
};

const sel = (a: Lr[], p: Ply): Lr | null => {
  const ds = p.dur / 1000;
  const ok = a.filter((r) => !r.instrumental && Math.abs((r.duration ?? 0) - ds) <= 5);
  const any = a.filter((r) => !r.instrumental);
  const pool = ok.length ? ok : any;
  pool.sort((x, y) => Number(y.hasWordSync) - Number(x.hasWordSync));
  return pool[0] ?? null;
};

const cvr = (d: Lr): Lyr | null => {
  let lnf: Lne[] | null = null;
  if (d.lyricsfile) {
    try {
      const ln = pseYml(d.lyricsfile);
      if (ln.length) {
        const wrd = ln.every(
          (l) => !l.s.trim() || l.w.length >= l.s.split(/\s+/).filter(Boolean).length,
        );
        if (wrd) return bldL(ln, "lrclib", true);
        lnf = ln;
      }
    } catch (e) {
      logWrn("lrclib", `broken lyricsfile: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (d.syncedLyrics) {
    const ln = pseLrc(d.syncedLyrics);
    if (ln.length) return bldL(ln, "lrclib", false);
  }
  return lnf ? bldL(lnf, "lrclib", false) : null;
};

export const fchLrc = async (p: Ply): Promise<Lyr | null> => {
  const q = new URLSearchParams({
    track_name: p.nm,
    artist_name: p.ar,
    album_name: p.alb,
    duration: String(Math.round(p.dur / 1000)),
  });
  let d = await gt(q);
  if (!d) d = sel(await sch(`${p.nm} ${p.ar}`), p);
  if (!d) return null;
  return cvr(d);
};
