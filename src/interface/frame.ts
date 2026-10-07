import { cfg } from "../config/env.ts";
import { PRS_MS } from "../config/const.ts";
import { S, ALBL, SROWS, dspK, langName, palName } from "../core/set.ts";
import { curLn } from "../core/state.ts";
import { ACC, CTX, GHO, GRY, HOT, NRM, RST, bt, cut, fg, spn, tstC, vw, wd } from "./anim.ts";
import type { RGB } from "./anim.ts";
import { bigTxt } from "./big.ts";
import { fmtT } from "../utils/time.ts";
import { mono } from "../utils/time.ts";
import type { Lne, Lyr, SRow, St } from "../types/typ.ts";

const PAD = "  ";
const PRE = "  ";
const SEP = "   ";
const GAP = 3;
const MINW = 24;

export type Btn = { id: string; x: number; y: number; w: number };
export type Geo = { btn: Btn[]; bar: { x: number; y: number; w: number } };
export type Fout = { rows: string[]; geo: Geo };

type Seg = { s: string; c: RGB | null };

const padW = (body: string, w: number): string => {
  const n = w - vw(body);
  return n > 0 ? body + " ".repeat(n) : body;
};

const wrp = (sgs: Seg[], w: number): string[] => {
  const rows: string[] = [];
  let cur = "";
  let cw = 0;
  const emit = (s: string, c: RGB | null): void => {
    cur += c ? `${fg(c)}${s}${RST}` : s;
    cw += vw(s);
  };
  for (const g of sgs) {
    const gw = vw(g.s);
    if (gw <= w) {
      if (cw > 0 && cw + gw > w) {
        rows.push(cur);
        cur = "";
        cw = 0;
      }
      emit(g.s, g.c);
      continue;
    }
    for (const ch of g.s) {
      const chw = vw(ch);
      if (cw > 0 && cw + chw > w) {
        rows.push(cur);
        cur = "";
        cw = 0;
      }
      emit(ch, g.c);
    }
  }
  if (cur) rows.push(cur);
  return rows;
};

const csg = (ln: Lne, d: number, hgh: boolean): Seg[] => {
  const o: Seg[] = [];
  if (!ln.w.length) {
    o.push({ s: ln.s, c: wd(d - ln.t, true, hgh) });
    return o;
  }
  let saw = -1;
  for (let i = 0; i < ln.w.length; i++) {
    if (ln.w[i]!.t <= d) saw = i;
  }
  for (let i = 0; i < ln.w.length; i++) {
    const w = ln.w[i]!;
    o.push({ s: w.s, c: wd(d - w.t, i === saw, hgh) });
  }
  return o;
};

const psg = (ln: Lne): Seg[] =>
  ln.w.length ? ln.w.map((x) => ({ s: x.s, c: null })) : [{ s: ln.s, c: null }];

type Wch = { l: Lyr; cw: number; rows: string[][]; st: number[]; tot: number };
let wch: Wch | null = null;

const wrapAll = (l: Lyr, cw: number): Wch => {
  if (wch && wch.l === l && wch.cw === cw) return wch;
  const rows: string[][] = [];
  const st: number[] = [];
  let tot = 0;
  for (const ln of l.ln) {
    st.push(tot);
    const r = wrp(psg(ln), cw);
    rows.push(r);
    tot += r.length;
  }
  wch = { l, cw, rows, st, tot };
  return wch;
};

const wrw = (t: string, w: number): string[] => {
  const out: string[] = [];
  let cur = "";
  for (const u of t.split(" ")) {
    if (!u) continue;
    if (!cur) cur = u;
    else if (vw(cur) + 1 + vw(u) <= w) cur = `${cur} ${u}`;
    else {
      out.push(cur);
      cur = u;
    }
    while (vw(cur) > w) {
      let cut = "";
      let i = 0;
      while (i < cur.length && vw(cut + cur[i]!) <= w) {
        cut += cur[i]!;
        i++;
      }
      if (!cut) {
        cut = cur[0]!;
        i = 1;
      }
      out.push(cut);
      cur = cur.slice(i);
    }
  }
  if (cur) out.push(cur);
  return out;
};

const auxR = (s: St, i: number, cw: number): string[] => {
  const a = s.aux;
  const out: string[] = [];
  if (i < 0) return out;
  const rows: string[] = [];
  if (a.rom && a.rl && a.rl[i]) rows.push(a.rl[i]!);
  if (a.vie && a.vl && a.vl[i]) rows.push(a.vl[i]!);
  const tw = cw - 2;
  for (let k = 0; k < rows.length; k++) {
    const last = k + 1 === rows.length;
    const ls = wrw(rows[k]!, tw);
    for (let j = 0; j < ls.length; j++) {
      const m = j === 0 ? (last ? "╰ " : "├ ") : last ? "  " : "│ ";
      out.push(`${fg(GRY)}${m}${ls[j]!}${RST}`);
    }
  }
  return out;
};

const lir = (s: St, d: number, cw: number, av: number): string[] => {
  const l = s.lyr;
  if (!l || av <= 0) return [];
  const hgh = cfg.sty === "highlight";
  const i = curLn(l, d);
  const c = wrapAll(l, cw);
  const ar = auxR(s, i, cw);
  const tot = c.tot + ar.length;
  let top = 0;
  if (i >= 0 && tot > av) top = Math.max(0, Math.min(c.st[i]! + ar.length - (av >> 1), tot - av));
  const end = top + av;
  const out: string[] = [];
  for (let k = 0; k < l.ln.length && out.length < av; k++) {
    const s0 = c.st[k]!;
    if (s0 >= end) break;
    const kCur = k === i;
    const rs = kCur ? [...wrp(csg(l.ln[k]!, d, hgh), cw), ...ar] : c.rows[k]!;
    const col = k < i ? CTX : GHO;
    for (let r = 0; r < rs.length && out.length < av; r++) {
      const abs = s0 + r;
      if (abs >= end) break;
      if (abs < top) continue;
      out.push(
        kCur ? (r === 0 ? `${fg(ACC)}> ${RST}` : PRE) + rs[r]! : `${PRE}${fg(col)}${rs[r]!}${RST}`,
      );
    }
  }
  return out;
};

const ctr = (txt: string, w: number, av: number, paint: (s: string) => string): string[] => {
  const out: string[] = Array.from({ length: Math.max(0, av) }, () => "");
  if (av <= 0) return out;
  const maxW = Math.max(4, w - 4);
  const lines: string[] = [];
  let cur = "";
  const hard = (word: string): void => {
    let seg = "";
    for (const ch of word) {
      if (vw(seg) + vw(ch) > maxW) {
        lines.push(seg);
        seg = "";
      }
      seg += ch;
    }
    if (seg) lines.push(seg);
  };
  for (const word of txt.split(/\s+/).filter(Boolean)) {
    if (vw(word) > maxW) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      hard(word);
      continue;
    }
    if (!cur) cur = word;
    else if (vw(cur) + 1 + vw(word) <= maxW) cur += ` ${word}`;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (!lines.length) return out;
  const top = Math.max(0, (av - lines.length) >> 1);
  for (let i = 0; i < lines.length && top + i < av; i++) {
    const ln = lines[i]!;
    const left = Math.max(0, (w - vw(ln)) >> 1);
    out[top + i] = `${" ".repeat(left)}${paint(ln)}`;
  }
  return out;
};

type Cur = { t: string; c: RGB };

const keyT = (): [string, string][] => [
  [dspK(S.keys.sp), "play / pause"],
  [`${dspK(S.keys.nx)} / ${dspK(S.keys.pv)}`, "next / previous track"],
  [`${dspK(S.keys.skb)} / ${dspK(S.keys.skf)}`, `seek ${S.skp / 1000} seconds`],
  [`${dspK(S.keys.osp)} / ${dspK(S.keys.osn)}`, `offset +${S.osk}ms / −${S.osk}ms`],
  [dspK(S.keys.rst), "reset the offset to 0"],
  [dspK(S.keys.tab), "toggle word view"],
  [dspK(S.keys.rom), "toggle romaji / pinyin"],
  [dspK(S.keys.vie), `toggle ${langName(S.lang)} translation`],
  [dspK(S.keys.me), "open the account screen"],
  [dspK(S.keys.cfg), "open settings"],
  [dspK(S.keys.hlp), "close this menu"],
  [dspK(S.keys.q), "quit"],
];

const mnu = (w: number, av: number): string[] => {
  const out: string[] = Array.from({ length: Math.max(0, av) }, () => "");
  if (av <= 0) return out;
  const KEY = keyT();
  const kw = Math.max(...KEY.map(([k]) => vw(k)));
  const body = KEY.map(
    ([k, d]) => `${fg(HOT)}${k}${RST}${" ".repeat(kw - vw(k) + 2)}${fg(NRM)}${d}${RST}`,
  );
  const gw = kw + 2 + Math.max(...KEY.map(([, d]) => vw(d)));
  const rows = [`${fg(ACC)}Keyboard${RST}`, "", ...body];
  const top = Math.max(0, (av - rows.length) >> 1);
  const left = Math.max(0, (w - gw) >> 1);
  const hof = Math.max(0, (gw - vw("Keyboard")) >> 1);
  for (let i = 0; i < rows.length && top + i < av; i++) {
    let ln = " ".repeat(left + (i === 0 ? hof : 0)) + rows[i]!;
    if (vw(ln) > w) ln = cut(ln, w);
    out[top + i] = ln;
  }
  return out;
};

const sScr = (s: St, w: number, av: number): string[] => {
  const out: string[] = Array.from({ length: Math.max(0, av) }, () => "");
  if (av <= 0) return out;
  const lab = (r: SRow): string => (r.k === "key" ? r.a.map((x) => ALBL[x]!).join(" / ") : r.lab);
  const val = (r: SRow, i: number): string => {
    if (r.k === "key") {
      if (s.reb && s.sRow === i && s.sQ.length) return "press a key";
      return r.a.map((x) => dspK(S.keys[x]!)).join(" / ");
    }
    if (r.k === "lang") return langName(S.lang);
    if (r.k === "aik") {
      if (s.inp !== null && s.sRow === i)
        return s.inp ? `${s.inp}▌` : "type, enter saves, esc cancels";
      if (S.aik) return `****${S.aik.slice(-4)}`;
      return cfg.aik ? `env ****${cfg.aik.slice(-4)}` : "not set";
    }
    if (r.k === "pal") return palName(S.acc);
    if (r.k === "osk") return `${S.osk}ms`;
    return `${S.skp / 1000}s`;
  };
  const labs = SROWS.map(lab);
  const vals = SROWS.map(val);
  const lw = Math.max(...labs.map(vw));
  const gw = Math.max(vw("Settings"), ...SROWS.map((_, i) => 2 + lw + 2 + vw(vals[i]!)));
  const body = SROWS.map((r, i) => {
    const sel = s.sRow === i;
    const c = sel ? ACC : CTX;
    return `${fg(c)}${sel ? ">" : " "}${RST} ${fg(sel ? HOT : NRM)}${labs[i]!}${RST}${" ".repeat(lw - vw(labs[i]!) + 2)}${fg(c)}${vals[i]!}${RST}`;
  });
  const rows = [`${fg(ACC)}Settings${RST}`, "", ...body];
  let off = 0;
  if (rows.length > av) off = Math.max(0, Math.min(2 + s.sRow - (av >> 1), rows.length - av));
  const top = rows.length > av ? 0 : Math.max(0, (av - rows.length) >> 1);
  const left = Math.max(0, (w - gw) >> 1);
  const hof = Math.max(0, (gw - vw("Settings")) >> 1);
  for (let i = 0; top + i < av; i++) {
    const j = off + i;
    if (j >= rows.length) break;
    let ln = " ".repeat(left + (j === 0 ? hof : 0)) + rows[j]!;
    if (vw(ln) > w) ln = cut(ln, w);
    out[top + i] = ln;
  }
  return out;
};

const lgScr = (s: St, w: number, av: number): string[] => {
  const out: string[] = Array.from({ length: Math.max(0, av) }, () => "");
  if (av <= 0) return out;
  const c = (t: string, col: RGB): string => {
    const left = Math.max(0, (w - vw(t)) >> 1);
    return `${" ".repeat(left)}${fg(col)}${t}${RST}`;
  };
  const rows: string[] = [];
  if (s.ses === "wait") {
    rows.push(c(s.pst === null ? "Signing in" : "Paste the redirect URL", ACC));
    rows.push("");
    if (s.pst === null) {
      const bw = Math.max(8, w - PAD.length * 2);
      const u = s.lnk ?? "";
      for (let i = 0; i < u.length; i += bw)
        rows.push(`${PAD}${fg(HOT)}${u.slice(i, i + bw)}${RST}`);
      rows.push("");
      rows.push(c("waiting for approval in your browser...", NRM));
      rows.push(c(`esc cancel${SEP}p paste the redirect URL`, CTX));
    } else {
      rows.push(cut(`${PAD}${fg(HOT)}${s.pst}▌${RST}`, w));
      rows.push("");
      rows.push(c(`enter submit${SEP}esc to go back`, CTX));
    }
  } else {
    rows.push(c("Not signed in", ACC));
    rows.push("");
    rows.push(c("splyric needs your Spotify account", NRM));
    rows.push("");
    rows.push(c(`press ${dspK(S.keys.me)} or enter to sign in`, HOT));
  }
  const top = Math.max(0, (av - rows.length) >> 1);
  for (let i = 0; i < rows.length && top + i < av; i++) out[top + i] = rows[i]!;
  return out;
};

const acScr = (s: St, w: number, av: number): string[] => {
  const out: string[] = Array.from({ length: Math.max(0, av) }, () => "");
  if (av <= 0) return out;
  const items: [string, string][] = [];
  if (s.usr) items.push(["signed in as", s.usr]);
  if (s.exp) {
    const d = new Date(s.exp);
    const hh = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    items.push(["session expires", hh]);
  }
  items.push(["sign out", dspK("\r")]);
  const lw = Math.max(...items.map(([l]) => vw(l)));
  const body = items.map(([l, v], i) => {
    const sel = i === items.length - 1;
    const col = sel ? ACC : CTX;
    return `${fg(col)}${sel ? ">" : " "}${RST} ${fg(sel ? HOT : NRM)}${l}${RST}${" ".repeat(lw - vw(l) + 2)}${fg(col)}${v}${RST}`;
  });
  const gw = Math.max(vw("Account"), ...items.map(([, v]) => 2 + lw + 2 + vw(v)));
  const rows = [`${fg(ACC)}Account${RST}`, "", ...body];
  const top = Math.max(0, (av - rows.length) >> 1);
  const left = Math.max(0, (w - gw) >> 1);
  const hof = Math.max(0, (gw - vw("Account")) >> 1);
  for (let i = 0; i < rows.length && top + i < av; i++) {
    let ln = " ".repeat(left + (i === 0 ? hof : 0)) + rows[i]!;
    if (vw(ln) > w) ln = cut(ln, w);
    out[top + i] = ln;
  }
  return out;
};

const curW = (s: St, d: number): Cur | null => {
  const l = s.lyr;
  if (!l || !l.ln.length) return null;
  const i = curLn(l, d);
  const line = i >= 0 ? l.ln[i]! : l.ln[0]!;
  if (!line.w.length) return { t: "...", c: HOT };
  let a = -1;
  for (let k = 0; k < line.w.length; k++) {
    if (line.w[k]!.t <= d) a = k;
  }
  if (a < 0) return { t: "...", c: HOT };
  const w = line.w[a]!;
  return { t: w.s.trim() || "...", c: HOT };
};

const wdr = (c: Cur, w: number, av: number): string[] | null => {
  const g = bigTxt(c.t, Math.max(8, w - PAD.length * 2), av, c.t === "...");
  if (!g) return null;
  const gw = vw(g[0]!);
  const left = Math.max(0, (w - gw) >> 1);
  const top = Math.max(0, (av - g.length) >> 1);
  const out: string[] = Array.from({ length: av }, () => "");
  for (let i = 0; i < g.length && top + i < av; i++) {
    out[top + i] = `${" ".repeat(left)}${fg(c.c)}${g[i]!}${RST}`;
  }
  return out;
};

const mid = (s: St, d: number, w: number, av: number): string[] => {
  if (av <= 0) return [];
  if (s.set) return sScr(s, w, av);
  if (s.ses !== "in") return lgScr(s, w, av);
  if (s.me) return acScr(s, w, av);
  if (s.hlp) return mnu(w, av);
  const gray = (l: string): string => `${fg(NRM)}${l}${RST}`;
  if (!s.ply) return ctr("No track playing", w, av, gray);
  if (!s.lyr) return ctr(s.ldg ? "Searching for lyrics..." : "No lyrics found", w, av, gray);
  if (s.view === "word") {
    const c = curW(s, d);
    if (!c) return ctr("No lyrics found", w, av, gray);
    const r = wdr(c, w, av);
    if (r) return r;
    return ctr(c.t, w, av, (l) => `${fg(c.c)}${l}${RST}`);
  }
  const out = lir(s, d, Math.max(8, w - PAD.length * 2), av);
  while (out.length < av) out.push("");
  return out;
};

const tit = (s: St, w: number): string => {
  const now = mono();
  const avail = w - PAD.length * 2;
  const o = s.tst && now - s.tst.at < s.tst.d ? s.tst : null;
  const raw = s.ply ? `${s.ply.ar} — ${s.ply.nm}` : "splyric";
  const rt0 = o ? cut(o.s, Math.max(4, avail - 5)) : s.ldg ? spn() : "";
  const r = o ? tstC(now - o.at, o.d, rt0) : rt0;
  const t = cut(raw, Math.max(4, avail - vw(r) - 1));
  const gap = Math.max(1, avail - vw(t) - vw(r));
  const body = `${PAD}${fg(ACC)}${t}${" ".repeat(gap)}${r}${PAD}`;
  return padW(body, w);
};

const btn = (s: St, geo: Geo, y: number): string => {
  const ply = s.ply;
  const ics: { id: string; lab: string }[] = [
    { id: "pv", lab: "|◀" },
    { id: "sp", lab: ply?.ply ? "▮▮" : "▶" },
    { id: "nx", lab: "▶|" },
  ];
  let row = PAD;
  let vis = PAD.length;
  for (const b of ics) {
    const prs = s.prs?.id === b.id && mono() - s.prs.at < PRS_MS;
    const st = prs ? 2 : s.hov === b.id ? 1 : 0;
    row += bt(b.lab, st);
    geo.btn.push({ id: b.id, x: vis + 1, y, w: vw(b.lab) });
    vis += vw(b.lab) + GAP;
    row += " ".repeat(GAP);
  }
  return row.trimEnd();
};

const trs = (s: St, p: number, w: number, geo: Geo, y: number): string => {
  const pl = s.ply;
  const bs = btn(s, geo, y);
  const bw = vw(bs);
  const t1 = pl ? fmtT(p) : "";
  const t2 = pl ? fmtT(pl.dur) : "";
  const t1w = t1 ? vw(t1) + 1 : 0;
  const t2w = t2 ? vw(t2) + 1 : 0;
  let n = Math.min(60, Math.max(0, w - PAD.length - bw - SEP.length - t1w - t2w));
  let t2o = t2;
  if (bw + SEP.length + t1w + n + t2w > w) {
    t2o = "";
    n = Math.min(60, Math.max(0, w - PAD.length - bw - SEP.length - t1w));
  }
  const k = pl && pl.dur > 0 ? Math.max(0, Math.min(1, p / pl.dur)) : 0;
  const f = Math.round(k * n);
  const fill = (f > 1 ? `${fg(ACC)}${"■".repeat(f - 1)}` : "") + (f > 0 ? `${fg(HOT)}■` : "");
  const b = `${fill}${f < n ? `${fg(GHO)}${"—".repeat(n - f)}` : ""}${RST}`;
  geo.bar = { x: bw + SEP.length + t1w + 1, y, w: n };
  let row = `${bs}${SEP}`;
  if (t1) row += `${fg(GRY)}${t1}${RST} `;
  row += b;
  if (t2o) row += ` ${fg(GRY)}${t2o}${RST}`;
  return padW(row, w);
};

export const bldFr = (s: St, p: number, w: number, h: number): Fout => {
  const geo: Geo = { btn: [], bar: { x: PAD.length + 1, y: Math.max(1, h - 1), w: 12 } };
  const d = p + s.off;
  const ww = Math.max(MINW, w);
  if (h >= 7) {
    const rows: string[] = [padW("", ww), tit(s, ww), padW("", ww)];
    for (const r of mid(s, d, ww, h - 6)) rows.push(padW(r, ww));
    rows.push(padW("", ww), trs(s, p, ww, geo, h - 1), padW("", ww));
    return { rows: rows.slice(0, h), geo };
  }
  const rows: string[] = [tit(s, ww)];
  for (const r of mid(s, d, ww, Math.max(0, h - 2))) rows.push(padW(r, ww));
  while (rows.length < h - 1) rows.push(padW("", ww));
  if (h >= 2) rows.push(trs(s, p, ww, geo, h));
  return { rows: rows.slice(0, h), geo };
};
