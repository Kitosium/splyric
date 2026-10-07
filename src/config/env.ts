import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Cfg } from "../types/typ.ts";

const envP = join(process.cwd(), ".env");
if (existsSync(envP)) process.loadEnvFile(envP);

const gs = (k: string, d: string): string => process.env[k] || d;
const gn = (k: string, d: number, lo: number, hi: number): number => {
  const v = Number(process.env[k] ?? d);
  return Number.isFinite(v) && v >= lo && v <= hi ? v : d;
};

const cid = gs("SPY_CID", "");
if (!cid) throw new Error("missing SPY_CID — create .env from .env.example");

export const cfg: Cfg = {
  cid,
  cs: gs("SPY_CS", ""),
  prt: gn("SPY_PORT", 8889, 1, 65535),
  pol: gn("SPY_POLL", 2000, 1000, 60000),
  src: gs("SPY_SRC", "lrclib,mxm,spot,ytc")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  sty: gs("SPY_STYLE", "reveal"),
  dck: gs("SPY_DC", ""),
  dtr: gs("SPY_DIR", join(homedir(), ".config", "splyric")),
  amb: gn("SPY_AMB", 1, 1, 2),
  aiu: gs("SPY_AI_URL", ""),
  aik: gs("SPY_AI_KEY", ""),
  aim: gs("SPY_AI_MODEL", ""),
};
