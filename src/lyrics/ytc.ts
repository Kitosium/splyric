import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { YTOL } from "../config/const.ts";
import { logErr, logWrn } from "../errors/log.ts";
import { Herr } from "../utils/http.ts";
import { bldL } from "./lrc.ts";
import type { Lne, Lyr, Ply } from "../types/typ.ts";

type J3e = { tStartMs?: number; segs?: { utf8?: string }[] };
type J3 = { events?: J3e[] };

let av: boolean | null = null;

const has = (): boolean => {
  if (av !== null) return av;
  try {
    av = spawnSync("yt-dlp", ["--version"], { stdio: "ignore", timeout: 5000 }).status === 0;
  } catch {
    logWrn("ytc", "yt-dlp not found — skipping YouTube source");
    av = false;
  }
  return av;
};

const ex = (a: string[]): Promise<string> =>
  new Promise((rs, rj) => {
    const c = spawn("yt-dlp", a, { stdio: ["ignore", "pipe", "pipe"] });
    let o = "";
    let e = "";
    c.stdout.on("data", (b: Buffer) => {
      o += b.toString();
    });
    c.stderr.on("data", (b: Buffer) => {
      e += b.toString();
    });
    c.on("error", rj);
    c.on("exit", (x) => {
      if (x === 0) rs(o);
      else rj(new Herr(x ?? 1, `yt-dlp error: ${e.slice(0, 200)}`));
    });
  });

const pseJ3 = (b: string): Lne[] => {
  const d = JSON.parse(b) as J3;
  const out: Lne[] = [];
  for (const e of d.events ?? []) {
    const s = (e.segs ?? [])
      .map((g) => g.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!s) continue;
    const t = Math.max(0, e.tStartMs ?? 0);
    out.push({ t, s, w: [{ t, s }] });
  }
  out.sort((a, b2) => a.t - b2.t);
  return out;
};

export const fchYtc = async (p: Ply): Promise<Lyr | null> => {
  if (!has()) return null;
  const meta = await ex([
    "--no-playlist",
    "--no-warnings",
    "--skip-download",
    "--print",
    "%(id)s\t%(duration)s",
    `ytsearch1:${p.nm} ${p.ar} lyrics`,
  ]);
  const [id, ds] = meta.trim().split("\t");
  if (!id || !ds) return null;
  if (Math.abs(Number(ds) * 1000 - p.dur) > YTOL) return null;
  const td = mkdtempSync(join(tmpdir(), "splyc-"));
  try {
    await ex([
      "--no-playlist",
      "--no-warnings",
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      "vi,en",
      "--sub-format",
      "json3",
      "-o",
      join(td, id),
      `https://www.youtube.com/watch?v=${id}`,
    ]);
    const f = readdirSync(td).find((n) => n.endsWith(".json3"));
    if (!f) return null;
    const ln = pseJ3(readFileSync(join(td, f), "utf8"));
    if (!ln.length) return null;
    return bldL(ln, "ytc", true);
  } catch (e) {
    logErr("ytc", e);
    return null;
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
};
