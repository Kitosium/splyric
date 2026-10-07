import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OFF_ST, SETF, SKP_MS } from "../config/const.ts";
import { cfg } from "../config/env.ts";
import { logErr } from "../errors/log.ts";
import type { RGB } from "../interface/anim.ts";
import { setAcc } from "../interface/pal.ts";
import type { Sets, SRow } from "../types/typ.ts";

export const LANGS: [string, string][] = [
  ["vi", "Vietnamese"],
  ["en", "English"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh", "Chinese"],
  ["fr", "French"],
  ["es", "Spanish"],
  ["de", "German"],
];

export const PALS: [string, string][] = [
  ["cyan", "#6eebff"],
  ["green", "#50eb96"],
  ["blue", "#78b4ff"],
  ["purple", "#c78bff"],
  ["magenta", "#ff8bd4"],
  ["yellow", "#ffe678"],
  ["orange", "#ffaa5c"],
  ["white", "#ebebeb"],
];

export const ALBL: Record<string, string> = {
  sp: "play / pause",
  nx: "next track",
  pv: "previous track",
  skb: "seek backward",
  skf: "seek forward",
  osp: "offset +",
  osn: "offset -",
  rst: "reset offset",
  tab: "word view",
  rom: "romaji / pinyin",
  vie: "translation",
  me: "account",
  hlp: "help menu",
  cfg: "settings",
  q: "quit",
};

export const SROWS: SRow[] = [
  { k: "key", a: ["sp"] },
  { k: "key", a: ["nx", "pv"] },
  { k: "key", a: ["skb", "skf"] },
  { k: "key", a: ["osp", "osn"] },
  { k: "key", a: ["rst"] },
  { k: "key", a: ["tab"] },
  { k: "key", a: ["rom"] },
  { k: "key", a: ["vie"] },
  { k: "key", a: ["me"] },
  { k: "key", a: ["hlp"] },
  { k: "key", a: ["cfg"] },
  { k: "key", a: ["q"] },
  { k: "lang", lab: "translate to" },
  { k: "aik", lab: "google ai key" },
  { k: "pal", lab: "accent color" },
  { k: "osk", lab: "offset step" },
  { k: "skp", lab: "seek step" },
];

export const DKEYS: Record<string, string> = {
  sp: " ",
  nx: "n",
  pv: "b",
  skb: "left",
  skf: "right",
  osp: "[",
  osn: "]",
  rst: "0",
  tab: "\t",
  hlp: "h",
  rom: "r",
  vie: "t",
  me: "l",
  cfg: "s",
  q: "q",
};

export const OSKS: number[] = [10, 25, 50, 100, 250, 500];
export const SKPS: number[] = [1000, 3000, 5000, 10000, 15000, 30000];

const pth = (): string => join(cfg.dtr, SETF);

const rgb = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const num = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : d;

export const loadSets = (): Sets => {
  const lang = "vi";
  const acc = PALS[0]![1];
  try {
    const j = JSON.parse(readFileSync(pth(), "utf8")) as Partial<Sets>;
    const keys = { ...DKEYS };
    if (j && typeof j.keys === "object" && j.keys) {
      for (const k of Object.keys(keys)) {
        const v = (j.keys as Record<string, unknown>)[k];
        if (typeof v === "string" && v.length) keys[k] = v;
      }
    }
    return {
      keys,
      lang: typeof j.lang === "string" && /^[a-z]{2,3}$/.test(j.lang) ? j.lang : lang,
      acc: typeof j.acc === "string" && /^#[0-9a-fA-F]{6}$/.test(j.acc) ? j.acc.toLowerCase() : acc,
      osk: num(j.osk, 10, 1000, OFF_ST),
      skp: num(j.skp, 500, 60000, SKP_MS),
      aik: typeof j.aik === "string" ? j.aik : cfg.aik,
    };
  } catch {
    return { keys: { ...DKEYS }, lang, acc, osk: OFF_ST, skp: SKP_MS, aik: cfg.aik };
  }
};

export const applyAcc = (): void => setAcc(rgb(S.acc));

export const S: Sets = loadSets();

applyAcc();

export const saveSets = (): void => {
  try {
    mkdirSync(cfg.dtr, { recursive: true });
    writeFileSync(pth(), JSON.stringify(S, null, 2));
    chmodSync(pth(), 0o600);
  } catch (e) {
    logErr("set", e);
  }
};

export const dspK = (t: string): string => {
  if (t === " ") return "space";
  if (t === "\t") return "tab";
  if (t === "\r" || t === "\n") return "enter";
  if (t === "\x1b") return "esc";
  if (t === "left") return "←";
  if (t === "right") return "→";
  if (t === "up") return "↑";
  if (t === "down") return "↓";
  if (t.charCodeAt(0) < 32) return `^${String.fromCharCode(t.charCodeAt(0) + 64)}`;
  return t;
};

export const langName = (c: string): string => LANGS.find(([x]) => x === c)?.[1] ?? c;

export const palName = (h: string): string => PALS.find(([, x]) => x === h)?.[0] ?? h;

const cyc = <T>(arr: T[], cur: T, d: number): T => {
  const i = arr.indexOf(cur);
  if (i < 0) return d > 0 ? arr[0]! : arr[arr.length - 1]!;
  return arr[(i + d + arr.length) % arr.length]!;
};

export const bindK = (a: string, tok: string): void => {
  if (!(a in S.keys) || S.keys[a] === tok) return;
  for (const k of Object.keys(S.keys)) if (S.keys[k] === tok) S.keys[k] = S.keys[a]!;
  S.keys[a] = tok;
  saveSets();
};

export const nLang = (d: number): void => {
  S.lang = cyc(
    LANGS.map(([c]) => c),
    S.lang,
    d,
  );
  saveSets();
};

export const nPal = (d: number): void => {
  S.acc = cyc(
    PALS.map(([, h]) => h),
    S.acc,
    d,
  );
  applyAcc();
  saveSets();
};

export const nNum = (k: "osk" | "skp", d: number): void => {
  S[k] = cyc(k === "osk" ? OSKS : SKPS, S[k], d);
  saveSets();
};
