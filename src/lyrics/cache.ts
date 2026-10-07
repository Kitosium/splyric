import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CAC_D, LYRD, OFFF } from "../config/const.ts";
import { cfg } from "../config/env.ts";
import { logErr } from "../errors/log.ts";
import type { Lyr } from "../types/typ.ts";

const lyD = (): string => join(cfg.dtr, LYRD);
const ofP = (): string => join(cfg.dtr, OFFF);

export const gLyr = (id: string): Lyr | null => {
  const p = join(lyD(), `${id}.json`);
  if (!existsSync(p)) return null;
  try {
    const d = JSON.parse(readFileSync(p, "utf8")) as { at: number; v: Lyr };
    if (Date.now() - d.at > CAC_D) return null;
    return d.v && d.v.ln && d.v.ln.length ? d.v : null;
  } catch (e) {
    logErr("cache", e);
    return null;
  }
};

export const sLyr = (id: string, v: Lyr): void => {
  try {
    mkdirSync(lyD(), { recursive: true });
    writeFileSync(join(lyD(), `${id}.json`), JSON.stringify({ at: Date.now(), v }));
  } catch (e) {
    logErr("cache", e);
  }
};

let ofs: Record<string, number> | null = null;

const ldO = (): Record<string, number> => {
  if (ofs) return ofs;
  if (!existsSync(ofP())) {
    ofs = {};
    return ofs;
  }
  try {
    ofs = JSON.parse(readFileSync(ofP(), "utf8")) as Record<string, number>;
  } catch (e) {
    logErr("cache", e);
    ofs = {};
  }
  return ofs;
};

export const gOff = (id: string): number => ldO()[id] ?? 0;

export const sOff = (id: string, v: number): void => {
  const o = ldO();
  o[id] = v;
  try {
    mkdirSync(cfg.dtr, { recursive: true });
    writeFileSync(ofP(), JSON.stringify(o));
  } catch (e) {
    logErr("cache", e);
  }
};
