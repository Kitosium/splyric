import { POP_MS, SIN_MS } from "../config/const.ts";
import { cfg } from "../config/env.ts";
import { mono } from "../utils/time.ts";
import { ACC } from "./pal.ts";

export { ACC };

export type RGB = [number, number, number];

export const RST = "\x1b[0m";
const INV = "\x1b[7m";

const WD: [number, number][] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
  [0x20000, 0x3fffd],
];

const ZW: [number, number][] = [
  [0x0300, 0x036f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x200b, 0x200f],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
];

const AMB: [number, number][] = [
  [0x2010, 0x2027],
  [0x2030, 0x205e],
  [0x2190, 0x21ff],
  [0x2300, 0x23ff],
  [0x2500, 0x257f],
  [0x25a0, 0x25ff],
  [0x2600, 0x26ff],
  [0x2700, 0x27bf],
  [0x2800, 0x28ff],
];

const inR = (cp: number, rs: [number, number][]): boolean => {
  for (const [a, b] of rs) if (cp >= a && cp <= b) return true;
  return false;
};

const wcc = new Map<number, number>();

export const chW = (cp: number): number => {
  const key = cp * 4 + cfg.amb;
  const c = wcc.get(key);
  if (c !== undefined) return c;
  let w = 1;
  if (inR(cp, ZW)) w = 0;
  else if (inR(cp, WD)) w = 2;
  else if (cfg.amb === 2 && inR(cp, AMB)) w = 2;
  wcc.set(key, w);
  return w;
};

export const vw = (s: string): number => {
  let n = 0;
  for (const ch of s.replace(/\x1b\[[0-9;]*m/g, "")) {
    n += chW(ch.codePointAt(0)!);
  }
  return n;
};

const CSI = /\x1b\[[0-9;]*m/y;

export const cut = (s: string, w: number): string => {
  let n = 0;
  let out = "";
  let i = 0;
  let clip = false;
  while (i < s.length) {
    CSI.lastIndex = i;
    const m = CSI.exec(s);
    if (m) {
      out += m[0];
      i += m[0].length;
      continue;
    }
    const cp = s.codePointAt(i)!;
    const cw = chW(cp);
    if (n + cw > w) {
      clip = true;
      break;
    }
    out += String.fromCodePoint(cp);
    n += cw;
    i += cp > 0xffff ? 2 : 1;
  }
  return clip && out.includes("\x1b[") ? `${out}${RST}` : out;
};

export const GHO: RGB = [72, 72, 72];
const SUN: RGB = [155, 155, 155];
export const HOT: RGB = [255, 255, 255];
export const NRM: RGB = [210, 210, 210];
export const GRY: RGB = [122, 122, 122];
export const CTX: RGB = [112, 112, 112];

export const mx = (a: RGB, b: RGB, k: number): RGB => {
  const t = k < 0 ? 0 : k > 1 ? 1 : k;
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
};

export const fg = (c: RGB): string => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;

const brz = (k: number): number => (1 - Math.cos(k * Math.PI * 2)) / 2;

export const wd = (age: number, cur: boolean, hgh: boolean): RGB => {
  if (age < 0) return hgh ? NRM : GHO;
  if (age < POP_MS) return mx(HOT, ACC, age / POP_MS);
  if (cur) return mx(ACC, HOT, brz((age - POP_MS) / SIN_MS) * 0.3);
  return mx(ACC, SUN, (age - POP_MS) / (POP_MS * 2));
};

export const bt = (s: string, st: number): string => {
  if (st === 2) return `${INV}${s}${RST}`;
  if (st === 1) return `${fg(HOT)}${s}${RST}`;
  return `${fg(GRY)}${s}${RST}`;
};

export const tstC = (age: number, d: number, s: string): string => {
  const inn = age < 150 ? mx(GHO, ACC, age / 150) : ACC;
  const k = d - age < 600 ? (d - age) / 600 : 1;
  return `${fg(mx(GHO, inn, k))}${s}${RST}`;
};

const SPN = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
export const spn = (): string => SPN[Math.floor(mono() / 80) % SPN.length]!;
