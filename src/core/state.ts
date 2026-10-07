import { TST_MS } from "../config/const.ts";
import { mono } from "../utils/time.ts";
import {
  ALBL,
  S,
  SROWS,
  bindK,
  dspK,
  langName,
  nLang,
  nNum,
  nPal,
  palName,
  saveSets,
} from "./set.ts";
import type { Aux, Lyr, St } from "../types/typ.ts";

export const nAux = (): Aux => ({ rom: false, vie: false, det: null, rl: null, vl: null });

let st: St = {
  ply: null,
  lyr: null,
  ldg: false,
  off: 0,
  tst: null,
  hov: null,
  prs: null,
  view: "lyric",
  hlp: false,
  set: false,
  reb: false,
  sRow: 0,
  sQ: [],
  inp: null,
  aux: nAux(),
  ses: "in",
  me: false,
  lnk: null,
  pst: null,
  usr: null,
  exp: null,
};

let subs: (() => void)[] = [];

export const gst = (): St => st;

export const setSt = (p: Partial<St>): void => {
  st = { ...st, ...p };
  for (const f of subs) f();
};

export const sub = (f: () => void): void => {
  subs.push(f);
};

export const say = (s: string, d = TST_MS): void => setSt({ tst: { s, at: mono(), d } });

export const setAux = (p: Partial<Aux>): void => setSt({ aux: { ...st.aux, ...p } });

export const togView = (): void => setSt({ view: gst().view === "word" ? "lyric" : "word" });

export const togHlp = (): void => setSt({ hlp: !gst().hlp });

export const togSet = (): void =>
  setSt({ set: !gst().set, hlp: false, sRow: 0, reb: false, sQ: [], inp: null });

export const togMe = (): void => setSt({ me: !gst().me, hlp: false });

export const sMov = (d: number): void => {
  const r = gst().sRow + d;
  setSt({ sRow: r < 0 ? 0 : r >= SROWS.length ? SROWS.length - 1 : r });
};

export const sChg = (d: number): void => {
  const r = SROWS[gst().sRow]!;
  if (r.k === "lang") {
    nLang(d);
    say(`Translate to: ${langName(S.lang)}`);
  } else if (r.k === "pal") {
    nPal(d);
    say(`Accent: ${palName(S.acc)}`);
  } else if (r.k === "osk") {
    nNum("osk", d);
    say(`Offset step: ${S.osk}ms`);
  } else if (r.k === "skp") {
    nNum("skp", d);
    say(`Seek step: ${S.skp / 1000}s`);
  }
};

export const sEnt = (): void => {
  const r = SROWS[gst().sRow]!;
  if (r.k === "key") setSt({ sQ: [...r.a], reb: true });
  else if (r.k === "aik") setSt({ inp: "" });
  else sChg(1);
};

export const sInp = (c: string): void => {
  const b = gst().inp ?? "";
  if (c === "\r" || c === "\n") {
    const v = b.trim();
    S.aik = v;
    saveSets();
    setSt({ inp: null });
    say(v ? "Google AI key saved" : "Google AI key cleared");
    return;
  }
  if (c === "\x1b") {
    setSt({ inp: null });
    say("Input cancelled");
    return;
  }
  if (c === "\x7f" || c === "\b") {
    setSt({ inp: b.slice(0, -1) });
    return;
  }
  if (c.length === 1 && c.charCodeAt(0) >= 32) setSt({ inp: b + c });
};

export const sBind = (c: string): void => {
  const q = gst().sQ;
  if (!q.length) {
    setSt({ reb: false });
    return;
  }
  if (c === "\x1b") {
    setSt({ reb: false, sQ: [] });
    say("Rebind cancelled");
    return;
  }
  const a = q[0]!;
  bindK(a, c);
  const nq = q.slice(1);
  setSt({ sQ: nq, reb: nq.length > 0 });
  say(`${ALBL[a]}: ${dspK(S.keys[a]!)}`);
};

export const curLn = (l: Lyr | null, p: number): number => {
  if (!l) return -1;
  let i = -1;
  for (let k = 0; k < l.ln.length; k++) {
    if (l.ln[k]!.t <= p) i = k;
    else break;
  }
  return i;
};
