import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Ply, St } from "../src/types/typ.ts";

process.env.SPY_CID ??= "test";
process.env.SPY_CS ??= "";
process.env.SPY_AI_KEY ??= "";
process.env.SPY_AI_URL ??= "";
process.env.SPY_AI_MODEL ??= "";
process.env.SPY_DIR ??= mkdtempSync(join(tmpdir(), "splyc-"));
process.env.SPY_SRC ??= "lrclib,mxm,spot,ytc";
process.env.SPY_STYLE ??= "reveal";
process.env.SPY_AMB ??= "1";

export const DIR = process.env.SPY_DIR!;

export const gj = (o: unknown, cd = 200): Response =>
  new Response(JSON.stringify(o), { status: cd });

export const mkPly = (p: Partial<Ply> = {}): Ply => ({
  id: "t1",
  nm: "Nice Song",
  ar: "The Artist",
  alb: "Album",
  dur: 60000,
  prg: 0,
  ply: true,
  ...p,
});

export const BASE: Partial<St> = {
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
  aux: { rom: false, vie: false, det: null, rl: null, vl: null },
  ses: "in",
  me: false,
  lnk: null,
  pst: null,
  usr: null,
  exp: null,
};

export const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

export const colBefore = (s: string, i: number): number[] | null => {
  const m = [...s.slice(0, i).matchAll(/38;2;(\d+);(\d+);(\d+)m/g)].pop();
  return m ? [+m[1]!, +m[2]!, +m[3]!] : null;
};
