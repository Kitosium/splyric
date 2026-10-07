import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { ACC, API, AUTH, RVK, SCO, TKF } from "../config/const.ts";
import { cfg } from "../config/env.ts";
import { logErr, logInf } from "../errors/log.ts";
import { Herr, jreq } from "../utils/http.ts";
import type { Tok } from "../types/typ.ts";

type Atr = { access_token: string; expires_in: number; refresh_token?: string };

const tkP = (): string => join(cfg.dtr, TKF);

const ldTk = (): Tok | null => {
  if (!existsSync(tkP())) return null;
  try {
    const t = JSON.parse(readFileSync(tkP(), "utf8")) as Tok;
    return t.at ? t : null;
  } catch (e) {
    logErr("auth", e);
    return null;
  }
};

const svTk = (t: Tok): void => {
  mkdirSync(cfg.dtr, { recursive: true });
  writeFileSync(tkP(), JSON.stringify(t), { mode: 0o600 });
  chmodSync(tkP(), 0o600);
};

const bsc = (): string => `Basic ${Buffer.from(`${cfg.cid}:${cfg.cs}`).toString("base64")}`;

const pst = async (b: URLSearchParams): Promise<Atr> =>
  jreq<Atr>(ACC, {
    method: "POST",
    headers: {
      Authorization: bsc(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: b.toString(),
  });

const rfTk = async (rt: string): Promise<Tok> => {
  const a = await pst(new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt }));
  const t: Tok = {
    at: a.access_token,
    rt: a.refresh_token ?? rt,
    ex: Date.now() + a.expires_in * 1000,
  };
  svTk(t);
  return t;
};

const mkVr = (): string => randomBytes(64).toString("base64url");
const mkCg = (v: string): string => createHash("sha256").update(v).digest("base64url");

const cbU = (): string => `http://127.0.0.1:${cfg.prt}/callback`;

const auU = (ch: string): string =>
  `${AUTH}?${new URLSearchParams({
    client_id: cfg.cid,
    response_type: "code",
    redirect_uri: cbU(),
    scope: SCO,
    code_challenge_method: "S256",
    code_challenge: ch,
  }).toString()}`;

const codeOf = (s: string): string | null => {
  const t = s.trim();
  if (t.startsWith("http")) {
    try {
      return new URL(t).searchParams.get("code");
    } catch {
      return null;
    }
  }
  return t.length > 20 ? t : null;
};

export type Flow = {
  url: string;
  done: Promise<Tok>;
  cancel: () => void;
  feed: (s: string) => boolean;
};

export const mkFlow = (): Flow => {
  const vr = mkVr();
  const ch = mkCg(vr);
  let rs: ((t: Tok) => void) | null = null;
  let rj: ((e: unknown) => void) | null = null;
  const done = new Promise<Tok>((a, b) => {
    rs = a;
    rj = b;
  });
  let srv: ReturnType<typeof createServer> | null = null;
  let tmo: ReturnType<typeof setTimeout> | null = null;
  let run = false;
  const fin = (): void => {
    if (tmo) clearTimeout(tmo);
    tmo = null;
    if (srv) srv.close();
    srv = null;
  };
  const ok = (t: Tok): void => {
    const f = rs;
    fin();
    f?.(t);
  };
  const bad = (e: unknown): void => {
    const f = rj;
    fin();
    f?.(e);
  };
  const ex = async (cd: string): Promise<void> => {
    if (run) return;
    run = true;
    try {
      const a = await pst(
        new URLSearchParams({
          grant_type: "authorization_code",
          code: cd,
          redirect_uri: cbU(),
          code_verifier: vr,
        }),
      );
      const t: Tok = {
        at: a.access_token,
        rt: a.refresh_token ?? "",
        ex: Date.now() + a.expires_in * 1000,
      };
      svTk(t);
      logInf("auth", "signed in");
      ok(t);
    } catch (e) {
      bad(e);
    }
  };
  srv = createServer((rq, rs2) => {
    const u = new URL(rq.url ?? "/", cbU());
    const c = u.searchParams.get("code");
    rs2.end("<html><body><h2>splyric: signed in</h2><h1>Back to the terminal.</h1></body></html>");
    if (c) void ex(c);
  });
  srv.once("error", () => bad(new Herr(498, "callback port in use")));
  srv.listen(cfg.prt, "127.0.0.1");
  tmo = setTimeout(() => bad(new Herr(408, "sign-in timed out")), 300000);
  return {
    url: auU(ch),
    done,
    cancel: () => bad(new Herr(499, "sign-in cancelled")),
    feed: (s: string) => {
      const c = codeOf(s);
      if (!c) return false;
      void ex(c);
      return true;
    },
  };
};

export const tkExists = (): boolean => existsSync(tkP());

export const readyTk = async (): Promise<Tok | null> => {
  const t = ldTk();
  if (!t) return null;
  if (t.ex > Date.now() + 60000) return t;
  if (!t.rt) return null;
  try {
    return await rfTk(t.rt);
  } catch (e) {
    const cd = e instanceof Herr ? e.cd : 0;
    if (cd === 400 || cd === 401) return null;
    logErr("auth", e);
    return t;
  }
};

export const outSes = (): void => {
  const t = ldTk();
  if (t?.at)
    void jreq(
      RVK,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(cfg.cs ? { Authorization: bsc() } : {}),
        },
        body: new URLSearchParams({ token: t.at, client_id: cfg.cid }).toString(),
      },
      4000,
    ).catch(() => undefined);
  try {
    unlinkSync(tkP());
  } catch {
    logInf("auth", "no stored session");
  }
  logInf("auth", "signed out");
};

export const gtMe = async (tok: string): Promise<string | null> => {
  try {
    const j = await jreq<{ display_name?: string }>(
      `${API}/me`,
      {
        headers: { Authorization: `Bearer ${tok}` },
      },
      8000,
    );
    return j.display_name || null;
  } catch (e) {
    logErr("auth", e);
    return null;
  }
};

export const rfNw = async (): Promise<Tok> => {
  const t = ldTk();
  if (!t?.rt) throw new Herr(401, "no refresh token");
  return await rfTk(t.rt);
};
