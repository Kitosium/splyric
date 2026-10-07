import { DIR, gj } from "./helpers.ts";
import { strict as A } from "node:assert";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { TestContext } from "node:test";
import type { Flow } from "../src/api/auth.ts";

process.env.SPY_PORT ??= "8891";

let hnd: (u: string) => Response = () => new Response("{}", { status: 404 });
globalThis.fetch = (async (u: unknown) => hnd(String(u))) as typeof fetch;

const { mkFlow, gtMe, outSes, readyTk, rfNw, tkExists } = await import("../src/api/auth.ts");
const { slp } = await import("../src/utils/time.ts");

const TK = join(DIR, "tok.json");

const freshTok = (): string => JSON.stringify({ at: "F", rt: "R", ex: Date.now() + 3600000 });

const staleTok = (): string => JSON.stringify({ at: "OLD", rt: "R", ex: Date.now() - 1000 });

const ownFlow = (t: TestContext): Flow => {
  const f = mkFlow();
  t.after(async () => {
    f.cancel();
    await f.done.then(
      () => undefined,
      () => undefined,
    );
  });
  return f;
};

beforeEach(() => {
  hnd = () => new Response("{}", { status: 404 });
});

afterEach(() => {
  rmSync(TK, { force: true });
});

describe("mkFlow", () => {
  test("the authorize url carries a pkce challenge and the local callback", (t) => {
    const f = ownFlow(t);
    A.ok(f.url.includes("accounts.spotify.com/authorize"), "the authorize url shows");
    A.ok(f.url.includes("code_challenge"), "with a pkce challenge");
    A.ok(
      decodeURIComponent(f.url).includes("127.0.0.1:8891/callback"),
      "pointing at the local callback",
    );
  });

  test("feed rejects a short paste", (t) => {
    const f = ownFlow(t);
    A.equal(f.feed("short"), false, "a short paste is rejected");
  });

  test("a redirect paste exchanges the code and stores the token", async (t) => {
    hnd = (u) =>
      u.includes("/api/token")
        ? gj({ access_token: "A", expires_in: 3600, refresh_token: "R" })
        : new Response("{}", { status: 404 });
    const f = ownFlow(t);
    A.equal(
      f.feed("https://127.0.0.1:8891/callback?code=CODE1234567890abcd"),
      true,
      "a redirect url parses",
    );
    const tok = await f.done;
    A.equal(tok.at, "A", "the exchange resolves with the token");
    A.ok(tkExists(), "the token lands in tok.json");
  });

  test("a flow can be cancelled", async (t) => {
    await slp(200);
    const f = ownFlow(t);
    f.cancel();
    const e: { cd?: number } | null = await f.done.then(
      () => null,
      (x: unknown) => x as { cd?: number },
    );
    A.equal(e?.cd, 499, "cancel rejects the flow");
  });
});

describe("readyTk", () => {
  test("a fresh token is returned without touching the network", async () => {
    writeFileSync(TK, freshTok());
    let calls = 0;
    hnd = () => {
      calls++;
      return new Response("{}", { status: 404 });
    };
    const tok = await readyTk();
    A.equal(tok?.at, "F", "the stored token returns");
    A.equal(calls, 0, "no network call for a fresh token");
  });

  test("a stale token is refreshed and written back to the file", async () => {
    writeFileSync(TK, staleTok());
    hnd = (u) =>
      u.includes("/api/token")
        ? gj({ access_token: "NEW", expires_in: 3600 })
        : new Response("{}", { status: 404 });
    const tok = await readyTk();
    A.equal(tok?.at, "NEW", "the refresh returns the new token");
    A.equal(
      (JSON.parse(readFileSync(TK, "utf8")) as { at: string }).at,
      "NEW",
      "the file is updated",
    );
  });

  test("a rejected refresh gives up and leaves the file alone", async () => {
    writeFileSync(TK, staleTok());
    hnd = () => gj({ error: "invalid_grant" }, 400);
    const tok = await readyTk();
    A.equal(tok, null, "a dead refresh hands over to the sign-in screen");
    A.ok(existsSync(TK), "the file is left alone");
    outSes();
    A.ok(!tkExists(), "sign out still clears it");
  });
});

describe("outSes", () => {
  test("sign out clears tok.json", () => {
    writeFileSync(TK, freshTok());
    outSes();
    A.ok(!tkExists(), "sign out clears tok.json");
  });
});

describe("rfNw", () => {
  test("rfNw fails open without a stored token", async () => {
    rmSync(TK, { force: true });
    const e: { cd?: number } | null = await rfNw().then(
      () => null,
      (x: unknown) => x as { cd?: number },
    );
    A.equal(e?.cd, 401, "no stored token reads as an expired session");
  });
});

describe("gtMe", () => {
  test("gtMe reads the display name", async () => {
    hnd = (u) =>
      u.includes("/me") ? gj({ display_name: "DJ Nova" }) : new Response("{}", { status: 404 });
    A.equal(await gtMe("X"), "DJ Nova", "the name shows");
  });

  test("gtMe hides the name when the profile call fails", async () => {
    hnd = () => new Response("nope", { status: 500 });
    A.equal(await gtMe("X"), null, "an error hides the name");
  });
});
