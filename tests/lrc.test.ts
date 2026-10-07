import { strict as A } from "node:assert";
import { describe, test } from "node:test";
import "./helpers.ts";
import { bldL, itp, pseLrc } from "../src/lyrics/lrc.ts";
import type { Lne } from "../src/types/typ.ts";

const SYNCED = "[00:12.34]hello world\n[01:00]line two\n[ar:abc]";

const twoStep = (): Lne[] => [
  { t: 1000, s: "one two three", w: [] },
  { t: 5000, s: "done", w: [] },
];

const unsorted = (): Lne[] => [
  { t: 5000, s: "second", w: [] },
  {
    t: 1000,
    s: "first",
    w: [
      { t: 300, s: "x" },
      { t: 100, s: "y" },
    ],
  },
];

describe("pseLrc", () => {
  test("parses synchronized timestamps", () => {
    const ln = pseLrc(SYNCED);
    A.equal(ln[0]!.t, 12340, "the fraction is read as hundredths of a second");
    A.equal(ln[0]!.s, "hello world", "the text after the tag becomes the line text");
    A.equal(ln[1]!.t, 60000, "a timestamp without a fraction parses as whole seconds");
  });

  test("skips metadata lines", () => {
    const ln = pseLrc(SYNCED);
    A.equal(ln.length, 2, "metadata tags do not turn into lyric lines");
  });

  test("expands multiple timestamps on one line", () => {
    const ln = pseLrc("[00:01.00][00:05.50]repeat");
    A.equal(ln.length, 2, "one line comes out per timestamp");
    A.equal(ln[0]!.t, 1000, "the first timestamp gets its own line");
    A.equal(ln[1]!.t, 5500, "the second timestamp gets its own line");
  });
});

describe("itp", () => {
  test("splits a line into its words", () => {
    const w = itp(twoStep())[0]!.w;
    A.equal(w.length, 3, "every word of the line is split out");
    A.equal(w[0]!.s, "one ", "non final words keep their trailing space");
    A.equal(w[2]!.s, "three", "the last word carries no trailing space");
  });

  test("spreads word times across the line span", () => {
    const w = itp(twoStep())[0]!.w;
    A.equal(w[0]!.t, 1000, "the first word starts at the line time");
    for (let i = 1; i < w.length; i++) A.ok(w[i]!.t >= w[i - 1]!.t, "word times never go back");
    A.ok(w[2]!.t < 5000, "every word lands before the next line");
  });

  test("keeps existing words", () => {
    const src = [{ t: 0, s: "keep", w: [{ t: 5, s: "keep" }] }];
    const out = itp(src);
    A.equal(out[0]!.w[0]!.t, 5, "an already split line is left untouched");
  });

  test("re-splits when words are missing", () => {
    const src = [{ t: 1000, s: "one two three", w: [{ t: 1000, s: "one" }] }];
    const out = itp(src);
    A.equal(out[0]!.w.length, 3, "missing words → re-split into all 3");
    A.equal(out[0]!.w[2]!.s, "three", "the re-split covers the whole line");
  });
});

describe("bldL", () => {
  test("sorts lines by time", () => {
    const l = bldL(unsorted(), "t", true);
    A.equal(l.ln[0]!.s, "first", "lines sorted by t");
    A.equal(l.ln[1]!.s, "second", "the later line comes last");
  });

  test("sorts words by time", () => {
    const l = bldL(unsorted(), "t", true);
    A.equal(l.ln[0]!.w[0]!.t, 100, "words sorted by t");
  });
});
