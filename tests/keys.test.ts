import { strict as A } from "node:assert";
import { beforeEach, describe, test } from "node:test";
import { BASE } from "./helpers.ts";
import type { Kbd } from "../src/interface/keys.ts";

const { pKs, pMs, len, hIt, key } = await import("../src/interface/keys.ts");
const { bldFr } = await import("../src/interface/frame.ts");
const { setSt, gst, togHlp, togView } = await import("../src/core/state.ts");
const { S, DKEYS, bindK, saveSets } = await import("../src/core/set.ts");

beforeEach(() => setSt({ ply: null, lyr: null, ...BASE }));

type Hit = { a: string; d?: number; c?: string };

const mk = (): { h: Hit[]; k: Kbd } => {
  const h: Hit[] = [];
  const k: Kbd = {
    q: () => h.push({ a: "q" }),
    sp: () => h.push({ a: "sp" }),
    nx: () => h.push({ a: "nx" }),
    pv: () => h.push({ a: "pv" }),
    ofs: (d) => h.push({ a: "ofs", d }),
    rst: () => h.push({ a: "rst" }),
    skd: (d) => h.push({ a: "skd", d }),
    sek: () => h.push({ a: "sek" }),
    hov: () => h.push({ a: "hov" }),
    dwn: () => h.push({ a: "dwn" }),
    tab: () => h.push({ a: "tab" }),
    hlp: () => h.push({ a: "hlp" }),
    rom: () => h.push({ a: "rom" }),
    vie: () => h.push({ a: "vie" }),
    me: () => h.push({ a: "me" }),
    sgn: () => h.push({ a: "sgn" }),
    pSt: () => h.push({ a: "pSt" }),
    pIn: (c) => h.push({ a: "pIn", c }),
    pCn: () => h.push({ a: "pCn" }),
    out: () => h.push({ a: "out" }),
    sCfg: () => h.push({ a: "sCfg" }),
    sNav: (d) => h.push({ a: "sNav", d }),
    sAdj: (d) => h.push({ a: "sAdj", d }),
    sEnt: () => h.push({ a: "sEnt" }),
    sCap: (c) => h.push({ a: "sCap", c }),
    sInp: (c) => h.push({ a: "sInp", c }),
  };
  return { h, k };
};

const acts = (h: Hit[]): string[] => h.map((x) => x.a);

describe("parsing input", () => {
  test("pKs reads plain keys and arrow keys", () => {
    A.deepEqual(pKs("q n"), ["q", " ", "n"]);
    A.deepEqual(pKs("\x1b[D"), ["left"]);
    A.deepEqual(pKs("\x1b[Cx"), ["right", "x"]);
    A.deepEqual(pKs("\t"), ["\t"], "tab passes through");
  });

  test("pMs reads clicks and hovers, and drops drags and wheels", () => {
    const press = pMs("\x1b[<0;10;2M", 0);
    A.deepEqual(press, { c: 10, r: 2, rel: false, mv: false }, "a press carries its cell");
    const rel = pMs("\x1b[<0;10;2m", 0);
    A.equal(rel?.rel, true, "lowercase m means release");
    const mv = pMs("\x1b[<35;40;3M", 0);
    A.deepEqual(mv, { c: 40, r: 3, rel: false, mv: true }, "motion without button = hover");
    A.equal(pMs("\x1b[<32;9;9M", 0), null, "drag → dropped");
    A.equal(pMs("\x1b[<64;5;5M", 0), null, "wheel → dropped");
    A.equal(pMs("\x1b[C", 0), null, "not a mouse event → null");
  });

  test("len measures the length of one escape sequence or key", () => {
    A.equal(len("\x1b[<0;12;4M q", 0), 10);
    A.equal(len("\x1b[Dq", 0), 3);
    A.equal(len("q", 0), 1);
  });
});

describe("hit testing", () => {
  const geo = () => bldFr(gst(), 0, 80, 24).geo;

  test("clicks outside the controls hit nothing", () => {
    A.equal(hIt(geo(), 1, 1), null, "top-left corner hits nothing");
    A.equal(hIt(geo(), 2, 2), null, "column 2 row 2 is empty");
    A.equal(hIt(geo(), 40, 5), null, "the lyric area above the controls hits nothing");
    A.equal(hIt(geo(), 40, 12), null, "the middle of the lyric area hits nothing");
  });

  test("a click lands on a button, even at its right edge", () => {
    const sp = geo().btn.find((x) => x.id === "sp")!;
    A.equal(hIt(geo(), sp.x, sp.y)?.id, "sp", "click hits the play button");
    A.equal(hIt(geo(), sp.x + sp.w - 1, sp.y)?.id, "sp", "click at the right edge still hits");
  });

  test("a click on the bar reports a fraction of the song", () => {
    const g = geo();
    const bh = hIt(g, g.bar.x + Math.floor(g.bar.w / 2), g.bar.y)!;
    A.equal(bh.id, "bar", "click in the middle of the bar → seek");
    A.ok(bh.f > 0.3 && bh.f < 0.7, `sane fraction = ${bh.f}`);
  });
});

describe("screen toggles", () => {
  test("tab switches between the lyric view and the word view", () => {
    A.equal(gst().view, "lyric", "starts in the lyric view");
    togView();
    A.equal(gst().view, "word", "first tab → word view");
    togView();
    A.equal(gst().view, "lyric", "second tab → lyric view");
  });

  test("h opens and closes the keyboard menu", () => {
    A.equal(gst().hlp, false, "menu starts closed");
    togHlp();
    A.equal(gst().hlp, true, "first h opens the menu");
    togHlp();
    A.equal(gst().hlp, false, "second h closes it again");
  });
});

describe("key routing", () => {
  test("an open input takes every letter and lets ^C out", () => {
    const { h, k } = mk();
    setSt({ set: true, inp: "" });
    key("a", k);
    key("q", k);
    key("\x1b", k);
    key("\x03", k);
    A.deepEqual(
      acts(h),
      ["sInp", "sInp", "sInp", "q"],
      "letters reach the input, q does not quit, only ^C does",
    );
    A.deepEqual(
      h.slice(0, 3).map((x) => x.c),
      ["a", "q", "\x1b"],
      "each character itself reaches the input",
    );
    h.length = 0;
    key("down", k);
    A.deepEqual(acts(h), ["sInp"], "navigation waits until the input closes");
  });

  test("keys route around the settings screen and through rebound keys", (t) => {
    const { h, k } = mk();
    key(" ", k);
    A.deepEqual(acts(h), ["sp"], "space plays by default");
    key("left", k);
    A.deepEqual(acts(h), ["sp", "skd"], "arrows seek");
    A.equal(h[1]!.d, -S.skp, "the seek step comes from settings");
    key("[", k);
    A.equal(h[2]!.d, S.osk, "the offset step comes from settings");
    h.length = 0;
    setSt({ set: true });
    key("down", k);
    key(" ", k);
    key("\x1b", k);
    A.deepEqual(acts(h), ["sNav", "sEnt", "sCfg"], "the screen swallows its own keys");
    A.equal(h[0]!.d, 1, "down moves the selection");
    h.length = 0;
    key("n", k);
    A.equal(h.length, 0, "playback keys stay quiet while the screen is open");
    setSt({ set: false, reb: true });
    key("n", k);
    A.deepEqual(acts(h), ["sCap"], "capture takes every key");
    setSt({ reb: false });
    h.length = 0;
    t.after(() => {
      Object.assign(S.keys, DKEYS);
      saveSets();
    });
    bindK("sp", "x");
    key("x", k);
    key(" ", k);
    A.deepEqual(acts(h), ["sp"], "a rebound key acts and the old one is free");
  });

  test("keys route through the sign-in, account and paste screens", () => {
    const { h, k } = mk();
    setSt({ ses: "in", me: true });
    key("\r", k);
    A.deepEqual(acts(h), ["out"], "enter signs out of the account screen");
    h.length = 0;
    key("\x1b", k);
    A.deepEqual(acts(h), ["me"], "escape closes the account screen");
    h.length = 0;
    setSt({ ses: "out", me: false });
    key("l", k);
    key(" ", k);
    A.deepEqual(acts(h), ["sgn", "sgn"], "the account key and space ask to sign in");
    h.length = 0;
    key("n", k);
    A.equal(h.length, 0, "playback keys stay quiet while signed out");
    setSt({ ses: "wait" });
    key("p", k);
    key("\x1b", k);
    A.deepEqual(acts(h), ["pSt", "pCn"], "the wait screen takes paste and cancel");
    h.length = 0;
    setSt({ pst: "" });
    key("a", k);
    key("\r", k);
    A.deepEqual(acts(h), ["pIn", "pIn"], "paste mode forwards every character");
    A.equal(h[0]!.c, "a", "the character itself");
    A.equal(h[1]!.c, "\r", "enter submits");
    h.length = 0;
    setSt({ ses: "in", pst: null, me: false });
    key("l", k);
    A.deepEqual(acts(h), ["me"], "the account key opens the account screen");
  });
});
