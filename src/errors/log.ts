import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { LOGF, MAX_LG } from "../config/const.ts";
import { cfg } from "../config/env.ts";

let scr = true;

export const setScr = (b: boolean): void => {
  scr = b;
};

const lgP = (): string => join(cfg.dtr, LOGF);

const rdk = (s: string): string =>
  s
    .replace(/(Bearer\s+)[^\s"]+/gi, "$1***")
    .replace(/(usertoken=)[^&\s]+/gi, "$1***")
    .replace(/("(?:access_?token|accessToken|refresh_token)"\s*:\s*")[^"]+/gi, "$1***")
    .replace(/(client_secret=)[^&\s]+/gi, "$1***");

const rot = (): void => {
  if (!existsSync(lgP())) return;
  try {
    if (statSync(lgP()).size > MAX_LG) renameSync(lgP(), `${lgP()}.1`);
  } catch (e) {
    process.stderr.write(`[ERR] rot: ${String(e)}\n`);
  }
};

const wr = (lv: string, src: string, msg: string): void => {
  const ln = rdk(`[${lv}] ${src}: ${msg}\n`);
  try {
    mkdirSync(cfg.dtr, { recursive: true });
    rot();
    appendFileSync(lgP(), ln);
  } catch (e) {
    process.stderr.write(`[ERR] log: ${String(e)}\n`);
  }
  if (scr) process.stderr.write(ln);
};

export const logInf = (src: string, msg: string): void => wr("INF", src, msg);
export const logWrn = (src: string, msg: string): void => wr("WRN", src, msg);
export const logErr = (src: string, e: unknown): void =>
  wr("ERR", src, e instanceof Error ? e.message : String(e));
