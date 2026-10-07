import { S } from "../core/set.ts";
import { gst } from "../core/state.ts";
import { logErr } from "../errors/log.ts";
import type { Geo } from "./frame.ts";

export type Kbd = {
  q: () => void;
  sp: () => void;
  nx: () => void;
  pv: () => void;
  ofs: (d: number) => void;
  rst: () => void;
  skd: (d: number) => void;
  sek: (f: number) => void;
  hov: (id: string | null) => void;
  dwn: (id: string) => void;
  tab: () => void;
  hlp: () => void;
  rom: () => void;
  vie: () => void;
  me: () => void;
  sgn: () => void;
  pSt: () => void;
  pIn: (c: string) => void;
  pCn: () => void;
  out: () => void;
  sCfg: () => void;
  sNav: (d: number) => void;
  sAdj: (d: number) => void;
  sEnt: () => void;
  sCap: (c: string) => void;
  sInp: (c: string) => void;
};

type Mse = { c: number; r: number; rel: boolean; mv: boolean };

const MRE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/y;
const ARE = /\x1b\[([ABCD])/y;
const CRE = /\x1b\[[0-9;?<]*[A-Za-z]/y;
const KMP: Record<string, string> = { A: "up", B: "down", C: "right", D: "left" };

export const pMs = (s: string, i: number): Mse | null => {
  MRE.lastIndex = i;
  const m = MRE.exec(s);
  if (!m) return null;
  const code = Number(m[1]);
  if (code >= 64 && code < 128) return null;
  const c = Number(m[2]);
  const r = Number(m[3]);
  const rel = m[4] === "m";
  if ((code & 32) !== 0) {
    return (code & 3) === 3 ? { c, r, rel: false, mv: true } : null;
  }
  return { c, r, rel, mv: false };
};

export const len = (s: string, i: number): number => {
  MRE.lastIndex = i;
  const m = MRE.exec(s);
  if (m) return m[0].length;
  ARE.lastIndex = i;
  const a = ARE.exec(s);
  if (a) return a[0].length;
  CRE.lastIndex = i;
  const c = CRE.exec(s);
  return c ? c[0].length : 1;
};

export const pKs = (s: string): string[] => {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "\x1b") {
      ARE.lastIndex = i;
      const a = ARE.exec(s);
      if (a) {
        out.push(KMP[a[1]!]!);
        i += a[0].length;
        continue;
      }
      CRE.lastIndex = i;
      const c = CRE.exec(s);
      i += c ? c[0].length : 1;
      continue;
    }
    out.push(s[i]!);
    i++;
  }
  return out;
};

export const hIt = (g: Geo, c: number, r: number): { id: string; f: number } | null => {
  for (const b of g.btn) {
    if (Math.abs(r - b.y) <= 1 && c >= b.x && c < b.x + b.w) {
      return { id: b.id, f: 0 };
    }
  }
  const { x, y, w } = g.bar;
  if (Math.abs(r - y) <= 1 && c >= x && c < x + w) {
    return { id: "bar", f: (c - x + 0.5) / w };
  }
  return null;
};

let on = false;

export const key = (c: string, k: Kbd): void => {
  const K = S.keys;
  const s = gst();
  if (s.reb) {
    k.sCap(c);
    return;
  }
  if (s.inp !== null) {
    if (c.charCodeAt(0) === 3) k.q();
    else k.sInp(c);
    return;
  }
  if (s.set) {
    if (c === "\x1b" || c === K.cfg) k.sCfg();
    else if (c === K.q || c.charCodeAt(0) === 3) k.q();
    else if (c === "up") k.sNav(-1);
    else if (c === "down") k.sNav(1);
    else if (c === "left") k.sAdj(-1);
    else if (c === "right") k.sAdj(1);
    else if (c === " " || c === "\r" || c === "\n") k.sEnt();
    return;
  }
  if (s.pst !== null) {
    k.pIn(c);
    return;
  }
  if (s.ses === "wait") {
    if (c === "\x1b") k.pCn();
    else if (c === "p") k.pSt();
    else if (c === K.q || c.charCodeAt(0) === 3) k.q();
    return;
  }
  if (s.ses !== "in") {
    if (c === K.me || c === "\r" || c === "\n" || c === " ") k.sgn();
    else if (c === K.q || c.charCodeAt(0) === 3) k.q();
    else if (c === K.tab) k.tab();
    else if (c === K.cfg) k.sCfg();
    return;
  }
  if (s.me) {
    if (c === "\x1b" || c === K.me) k.me();
    else if (c === "\r" || c === "\n") k.out();
    else if (c === K.q || c.charCodeAt(0) === 3) k.q();
    return;
  }
  if (c === K.q || c.charCodeAt(0) === 3) k.q();
  else if (c === K.sp) k.sp();
  else if (c === K.nx) k.nx();
  else if (c === K.pv) k.pv();
  else if (c === K.osp) k.ofs(S.osk);
  else if (c === K.osn) k.ofs(-S.osk);
  else if (c === K.rst) k.rst();
  else if (c === K.skb) k.skd(-S.skp);
  else if (c === K.skf) k.skd(S.skp);
  else if (c === K.tab) k.tab();
  else if (c === K.hlp) k.hlp();
  else if (c === K.cfg) k.sCfg();
  else if (c === K.rom) k.rom();
  else if (c === K.vie) k.vie();
  else if (c === K.me) k.me();
};

const clk = (h: { id: string; f: number }, k: Kbd): void => {
  if (h.id === "bar") k.sek(h.f);
  else {
    k.dwn(h.id);
    if (h.id === "pv") k.pv();
    else if (h.id === "sp") k.sp();
    else if (h.id === "nx") k.nx();
  }
};

export const entK = (k: Kbd, g: () => Geo): void => {
  if (on || !process.stdin.isTTY) return;
  on = true;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (b: Buffer) => {
    try {
      const s = b.toString("utf8");
      let i = 0;
      while (i < s.length) {
        const n = len(s, i);
        const m = pMs(s, i);
        if (m) {
          if (m.mv) {
            const h = hIt(g(), m.c, m.r);
            k.hov(h ? h.id : null);
          } else if (!m.rel) {
            const h = hIt(g(), m.c, m.r);
            k.hov(h ? h.id : null);
            if (h) clk(h, k);
          }
        } else if (s[i] === "\x1b") {
          const a = pKs(s.slice(i, i + n));
          if (a[0] && a[0] !== "\x1b") key(a[0], k);
          else if (n === 1 && s.length === 1) key("\x1b", k);
        } else {
          key(s[i]!, k);
        }
        i += n;
      }
    } catch (e) {
      logErr("keys", e);
    }
  });
};

export const extK = (): void => {
  if (!on) return;
  on = false;
  process.stdin.setRawMode(false);
  process.stdin.pause();
};
