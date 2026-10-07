import { MXMI, MXMU } from "../config/const.ts";
import { logErr, logWrn } from "../errors/log.ts";
import { jreq, req } from "../utils/http.ts";
import { bldL, pseLrc } from "./lrc.ts";
import type { Lne, Lyr, Ply, Wrd } from "../types/typ.ts";

type Mch = { commontrack_id?: number };
type Sub = { subtitle?: { subtitle_body?: string } };
type Mmac = {
  message: {
    header: { status_code?: number };
    body?: {
      macro_calls?: {
        "matcher.track.get"?: { message: { body: { track?: Mch } } };
        "track.subtitles.get"?: { message: { body: { subtitle_list?: Sub[] } } };
      };
    };
  };
};
type Mrch = {
  message: {
    header: { status_code?: number };
    body?: { richsync?: { richsync_body?: string } };
  };
};
type Mtk = { message: { header: { status_code?: number }; body?: { user_token?: string } } };

let tk: string | null = null;

const tok = async (f: boolean): Promise<string | null> => {
  if (tk && !f) return tk;
  try {
    const d = await jreq<Mtk>(`${MXMU}/token.get?app_id=${MXMI}&format=json`);
    const u = d.message?.body?.user_token ?? null;
    if (!u || /^0+$/.test(u)) {
      logWrn("mxm", "Musixmatch returned an empty token (IP throttled) — dropping source mxm");
      tk = null;
      return null;
    }
    tk = u;
  } catch (e) {
    logErr("mxm", e);
    tk = null;
  }
  return tk;
};

export const pseRch = (b: string): Lne[] => {
  const a = JSON.parse(b) as {
    ts?: number;
    x?: string;
    l?: { c?: string; o?: number }[];
  }[];
  const out: Lne[] = [];
  for (const e of a) {
    const t = Math.round((e.ts ?? 0) * 1000);
    const w: Wrd[] = (e.l ?? []).map((c) => ({
      t: t + Math.round((c.o ?? 0) * 1000),
      s: c.c ?? "",
    }));
    const s =
      (e.x ?? "").trim() ||
      w
        .map((x) => x.s)
        .join("")
        .trim();
    if (!s) continue;
    out.push({ t, s, w });
  }
  return out;
};

export const pseSub = (b: string): Lne[] => {
  let a: { text?: string; time?: { total?: number } }[];
  try {
    a = JSON.parse(b) as { text?: string; time?: { total?: number } }[];
  } catch {
    return pseLrc(b);
  }
  const out: Lne[] = [];
  for (const e of a) {
    const s = (e.text ?? "").trim();
    if (!s) continue;
    out.push({ t: Math.round((e.time?.total ?? 0) * 1000), s, w: [] });
  }
  return out;
};

const mac = async (t: string, p: Ply): Promise<{ cd: number; d: Mmac | null }> => {
  const q = new URLSearchParams({
    format: "json",
    namespace: "lyrics_richsynched",
    subtitle_format: "mxm",
    q_track: p.nm,
    q_artist: p.ar,
    q_duration: String(Math.round(p.dur / 1000)),
    app_id: MXMI,
    usertoken: t,
  });
  const r = await req(`${MXMU}/macro.subtitles.get?${q}`);
  if (r.cd >= 400) return { cd: r.cd, d: null };
  try {
    const d = JSON.parse(r.bd) as Mmac;
    return { cd: d.message?.header?.status_code ?? r.cd, d };
  } catch (e) {
    logErr("mxm", e);
    return { cd: 500, d: null };
  }
};

const rch = async (cid: string, t: string): Promise<Lyr | null> => {
  const q = new URLSearchParams({
    format: "json",
    commontrack_id: cid,
    app_id: MXMI,
    usertoken: t,
  });
  const r = await req(`${MXMU}/track.richsync.get?${q}`);
  if (r.cd >= 400) return null;
  let d: Mrch | null;
  try {
    d = JSON.parse(r.bd) as Mrch;
  } catch (e) {
    logErr("mxm", e);
    return null;
  }
  if ((d?.message?.header?.status_code ?? 500) >= 400) return null;
  const b = d?.message?.body?.richsync?.richsync_body;
  if (!b) return null;
  try {
    const ln = pseRch(b);
    if (ln.length) return bldL(ln, "mxm", true);
  } catch (e) {
    logErr("mxm", e);
  }
  return null;
};

const aft = async (d: Mmac, t: string, p: Ply): Promise<Lyr | null> => {
  const mc = d.message?.body?.macro_calls;
  const cid = mc?.["matcher.track.get"]?.message?.body?.track?.commontrack_id;
  if (cid) {
    const r = await rch(String(cid), t);
    if (r) return r;
  }
  const sb =
    mc?.["track.subtitles.get"]?.message?.body?.subtitle_list?.[0]?.subtitle?.subtitle_body;
  if (sb) {
    try {
      const ln = pseSub(sb);
      if (ln.length) return bldL(ln, "mxm", false);
    } catch (e) {
      logErr("mxm", e);
    }
  }
  return null;
};

export const fchMxm = async (p: Ply): Promise<Lyr | null> => {
  let t = await tok(false);
  if (!t) return null;
  for (let i = 0; i < 2; i++) {
    const m = await mac(t, p);
    if (m.cd === 401) {
      t = await tok(true);
      if (!t) return null;
      continue;
    }
    if (m.cd >= 400 || !m.d) return null;
    return aft(m.d, t, p);
  }
  return null;
};
