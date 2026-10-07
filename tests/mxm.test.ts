import { strict as A } from "node:assert";
import { describe, test } from "node:test";
import "./helpers.ts";
import { pseRch, pseSub } from "../src/lyrics/mxm.ts";

const j = (v: unknown): string => JSON.stringify(v);

const rich = (): string =>
  j([
    {
      ts: 12.5,
      te: 15.1,
      x: "see you",
      l: [
        { c: "see ", o: 0.2 },
        { c: "you", o: 0.6 },
      ],
    },
  ]);

const richMixed = (): string =>
  j([
    { ts: 0, te: 1, x: "", l: [] },
    { ts: 1, te: 2, x: "has text", l: [{ c: "has text", o: 0 }] },
  ]);

const subs = (): string =>
  j([
    { text: "line one", time: { total: 3.5 } },
    { text: "  ", time: { total: 4 } },
  ]);

describe("pseRch", () => {
  test("reads the line out of the richsync chunk", () => {
    const ln = pseRch(rich());
    A.equal(ln.length, 1, "one line comes out of the chunk");
    A.equal(ln[0]!.t, 12500, "the line start is converted from seconds to milliseconds");
    A.equal(ln[0]!.s, "see you", "the display text is taken from x");
  });

  test("word time = ts + o", () => {
    const ln = pseRch(rich());
    A.equal(ln[0]!.w[0]!.t, 12700, "word time = ts + o");
    A.equal(ln[0]!.w[1]!.t, 13100, "word time = ts + o");
  });

  test("drops empty chunks", () => {
    const ln = pseRch(richMixed());
    A.equal(ln.length, 1, "a chunk without text is skipped");
    A.equal(ln[0]!.t, 1000, "the surviving chunk keeps its own time");
  });
});

describe("pseSub", () => {
  test("keeps only lines with text", () => {
    const ln = pseSub(subs());
    A.equal(ln.length, 1, "whitespace only lines are dropped");
  });

  test("converts line time from seconds to milliseconds", () => {
    const ln = pseSub(subs());
    A.equal(ln[0]!.t, 3500, "time.total is seconds → ms");
  });

  test("subtitle lines carry no word timings", () => {
    const ln = pseSub(subs());
    A.equal(ln[0]!.w.length, 0, "subtitles are line synced only");
  });

  test("also accepts the LRC form", () => {
    const ln = pseSub("[00:12.00]line one\n[00:16.50]line two");
    A.equal(ln.length, 2, "a non JSON body falls back to LRC parsing");
    A.equal(ln[0]!.t, 12000, "the first LRC timestamp converts to milliseconds");
    A.equal(ln[1]!.t, 16500, "the second LRC timestamp converts to milliseconds");
  });
});
