import { DIR, gj, mkPly } from "./helpers.ts";
import { strict as A } from "node:assert";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

const yml = [
  "version: '1.0'",
  "metadata: {title: Test}",
  "lines:",
  "  - text: 'Hello'",
  "    start_ms: 1000",
  "    words:",
  "      - text: 'Hel '",
  "        start_ms: 1000",
  "      - text: 'lo'",
  "        start_ms: 1400",
].join("\n");

const ymlLn = [
  "version: '1.0'",
  "metadata: {title: Test}",
  "lines:",
  "  - text: 'Hi there'",
  "    start_ms: 1000",
  "  - text: 'hi there'",
  "    start_ms: 3000",
].join("\n");

const rsBody = JSON.stringify([
  {
    ts: 1,
    te: 3,
    x: "hello there",
    l: [
      { c: "hel ", o: 0.1 },
      { c: "lo", o: 0.5 },
    ],
  },
]);

const LRC_WORD = {
  id: 1,
  duration: 60,
  hasWordSync: true,
  lyricsfile: yml,
  syncedLyrics: null,
};

const LRC_LINES = {
  id: 2,
  duration: 60,
  hasWordSync: false,
  lyricsfile: ymlLn,
  syncedLyrics: null,
};

type H = (u: string) => Response | null;

let calls: string[] = [];
let hnd: H = () => null;

globalThis.fetch = (async (u: unknown) => {
  const s = String(u);
  calls.push(s);
  return hnd(s) ?? new Response("{}", { status: 404 });
}) as typeof fetch;

const { bldLyr } = await import("../src/lyrics/pipe.ts");
const { gLyr } = await import("../src/lyrics/cache.ts");
const { cfg } = await import("../src/config/env.ts");
const { LYRD } = await import("../src/config/const.ts");

const miss = (): Response => new Response("{}", { status: 404 });

const lrc =
  (body: unknown): H =>
  (u) => {
    if (u.includes("lrclib.net/api/get")) return body === null ? miss() : gj(body);
    if (u.includes("lrclib.net/api/search")) return gj([]);
    return null;
  };

const mxm: H = (u) => {
  if (u.includes("token.get"))
    return gj({ message: { header: { status_code: 200 }, body: { user_token: "ut" } } });
  if (u.includes("macro.subtitles.get"))
    return gj({
      message: {
        header: { status_code: 200 },
        body: {
          macro_calls: {
            "matcher.track.get": { message: { body: { track: { commontrack_id: 9 } } } },
            "track.subtitles.get": {
              message: { body: { subtitle_list: [{ subtitle: { subtitle_body: "[]" } }] } },
            },
          },
        },
      },
    });
  if (u.includes("track.richsync.get"))
    return gj({
      message: { header: { status_code: 200 }, body: { richsync: { richsync_body: rsBody } } },
    });
  return null;
};

const chain =
  (...hs: H[]): H =>
  (u) => {
    for (const h of hs) {
      const r = h(u);
      if (r) return r;
    }
    return miss();
  };

beforeEach(() => {
  calls = [];
  hnd = () => null;
});

afterEach(() => {
  rmSync(join(DIR, LYRD), { recursive: true, force: true });
});

describe("bldLyr source priority", () => {
  test("word-synced lrclib lyrics are used first", async () => {
    hnd = chain(lrc(LRC_WORD));
    const r = await bldLyr(mkPly({ id: "pipe-lrclib-word" }));
    A.ok(r, "the first source answers");
    A.equal(r!.src, "lrclib", "lrclib sits at the front of the pipe");
    A.equal(r!.wrd, true, "the lyricsfile carries word timings");
    A.equal(r!.ln[0]!.w[1]!.t, 1400, "the word start_ms is parsed");
    A.equal(calls.length, 1, "stops at the first source");
  });

  test("word-level mxm wins over line-level lrclib", async () => {
    hnd = chain(lrc(LRC_LINES), mxm);
    const r = await bldLyr(mkPly({ id: "pipe-mxm-word" }));
    A.ok(r, "a later source answers");
    A.equal(r!.src, "mxm", "word-level always beats line-level");
    A.equal(r!.wrd, true, "the richsync carries word timings");
  });
});

describe("bldLyr fallbacks", () => {
  test("empty lrclib falls through to mxm richsync", async () => {
    hnd = chain(lrc(null), mxm);
    const r = await bldLyr(mkPly({ id: "pipe-mxm-fallback" }));
    A.ok(r, "a later source answers");
    A.equal(r!.src, "mxm", "lrclib had nothing to give");
    A.equal(r!.wrd, true, "the richsync carries word timings");
    A.equal(r!.ln[0]!.w[0]!.t, 1100, "the first word sits at ts + o");
    A.equal(r!.ln[0]!.w[1]!.t, 1500, "the second word sits at ts + o");
  });

  test("a line-level lrclib file is kept when no word source exists", async (t) => {
    const keep = cfg.src;
    t.after(() => {
      cfg.src = keep;
    });
    cfg.src = ["lrclib"];
    hnd = chain(lrc(LRC_LINES));
    const r = await bldLyr(mkPly({ id: "pipe-lrclib-lines" }));
    A.ok(r, "must not drop the source when lyricsfile lacks words");
    A.equal(r!.src, "lrclib", "the line-level source still answers");
    A.equal(r!.wrd, false, "line sync stays line sync");
    A.equal(r!.ln.length, 2, "both lines come out");
    A.equal(r!.ln[0]!.w.length, 2, "interpolates every word");
    A.ok(r!.ln[0]!.w[1]!.t > r!.ln[0]!.w[0]!.t, "word times increase");
    A.ok(r!.ln[1]!.w[0]!.t >= 3000, "line 2 starts at its start_ms");
  });
});

describe("bldLyr caching", () => {
  test("a built track is cached for the next lookup", async () => {
    hnd = chain(lrc(LRC_WORD));
    const p = mkPly({ id: "pipe-cached" });
    const r = await bldLyr(p);
    A.ok(r, "the track builds");
    A.ok(gLyr(p.id), "cached after fetching");
  });
});
