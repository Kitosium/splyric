import { API } from "../config/const.ts";
import { Herr, hOk, req } from "../utils/http.ts";
import type { Hres, Ply } from "../types/typ.ts";

export type Pout = { cd: number; pl: Ply | null; ts: number; te: number; rta: number };

type Praw = {
  item: {
    id: string;
    name: string;
    duration_ms: number;
    artists: { name: string }[];
    album: { name: string };
  } | null;
  progress_ms: number | null;
  is_playing: boolean;
};

export const fchPly = async (at: string): Promise<Pout> => {
  const ts = performance.now();
  const r = await req(`${API}/me/player/currently-playing?additional_types=track`, {
    headers: { Authorization: `Bearer ${at}` },
  });
  const te = performance.now();
  const rta = Number(r.hd.get("retry-after") ?? 0);
  if (r.cd !== 200) return { cd: r.cd, pl: null, ts, te, rta };
  let d: Praw | null;
  try {
    d = JSON.parse(r.bd) as Praw | null;
  } catch (e) {
    throw new Herr(500, `invalid now-playing json: ${e instanceof Error ? e.message : e}`);
  }
  if (!d?.item) return { cd: 200, pl: null, ts, te, rta };
  const pl: Ply = {
    id: d.item.id,
    nm: d.item.name,
    ar: d.item.artists.map((a) => a.name).join(", "),
    alb: d.item.album.name,
    dur: d.item.duration_ms,
    prg: d.progress_ms ?? 0,
    ply: d.is_playing,
  };
  return { cd: 200, pl, ts, te, rta };
};

const cmd = async (at: string, m: string, u: string): Promise<void> => {
  const r: Hres = await req(`${API}/me/player/${u}`, {
    method: m,
    headers: { Authorization: `Bearer ${at}` },
  });
  hOk(r, u);
};

export const plyCmd = (at: string, on: boolean): Promise<void> =>
  cmd(at, "PUT", on ? "play" : "pause");

export const nxtPly = (at: string): Promise<void> => cmd(at, "POST", "next");

export const prvPly = (at: string): Promise<void> => cmd(at, "POST", "previous");

export const sekPly = (at: string, ms: number): Promise<void> =>
  cmd(at, "PUT", `seek?position_ms=${Math.max(0, Math.round(ms))}`);
