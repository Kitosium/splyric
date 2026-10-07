import { strict as A } from "node:assert";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type TestContext, beforeEach, describe, test } from "node:test";
import { BASE, DIR } from "./helpers.ts";

const {
  S,
  SROWS,
  ALBL,
  DKEYS,
  PALS,
  applyAcc,
  bindK,
  dspK,
  langName,
  loadSets,
  nLang,
  nNum,
  nPal,
  palName,
  saveSets,
} = await import("../src/core/set.ts");
const { gst, sBind, sChg, sEnt, sInp, sMov, setSt, togSet } = await import("../src/core/state.ts");
const { cfg } = await import("../src/config/env.ts");
const pal = await import("../src/interface/pal.ts");

beforeEach(() => setSt({ ...BASE }));

const fset = (): { keys: Record<string, string>; aik?: string } =>
  JSON.parse(readFileSync(join(DIR, "set.json"), "utf8"));

const openRow = (n: number): void => {
  togSet();
  setSt({ sRow: n });
};

describe("defaults and names", () => {
  test("every action has a key, a label and a settings row", () => {
    A.deepEqual(S.keys, DKEYS, "no set.json keeps the defaults");
    for (const a of Object.keys(DKEYS)) A.ok(ALBL[a], `action ${a} has a label`);
    const used = SROWS.flatMap((r) => (r.k === "key" ? r.a : []));
    A.deepEqual([...used].sort(), Object.keys(DKEYS).sort(), "settings lists every action");
    A.equal(S.lang, "vi", "vietnamese is the default target");
    A.equal(S.osk, 50, "default offset step");
    A.equal(S.skp, 5000, "default seek step");
    A.deepEqual([...pal.ACC], [110, 235, 255], "the accent is applied at load");
  });

  test("special keys, languages and palettes read human", () => {
    A.equal(dspK(" "), "space");
    A.equal(dspK("\t"), "tab");
    A.equal(dspK("\r"), "enter");
    A.equal(dspK("\x1b"), "esc");
    A.equal(dspK("left"), "←");
    A.equal(dspK("right"), "→");
    A.equal(dspK("\x03"), "^C");
    A.equal(dspK("x"), "x");
    A.equal(langName("vi"), "Vietnamese");
    A.equal(langName("it"), "it", "an unknown code passes through");
    A.equal(palName("#6eebff"), "cyan");
    A.equal(palName("#123456"), "#123456", "a custom accent shows its hex");
  });
});

describe("loading and saving", () => {
  test("loadSets merges a partial file and coerces bad values", () => {
    writeFileSync(
      join(DIR, "set.json"),
      JSON.stringify({ lang: "JA", acc: "red", osk: 99999, keys: { nx: "x", ghost: "z" } }),
    );
    const j = loadSets();
    A.equal(j.lang, "vi", "a bad language falls back");
    A.equal(j.acc, "#6eebff", "a bad color falls back");
    A.equal(j.osk, 50, "an out-of-range step falls back");
    A.equal(j.keys.nx, "x", "a rebound key is kept");
    A.equal(j.keys.sp, " ", "missing keys fill in");
    A.ok(!("ghost" in j.keys), "unknown actions are dropped");
    A.equal(j.aik, cfg.aik, "a missing key falls back to the env value");
    A.notEqual(S.keys.nx, "x", "the live settings stay untouched");
    unlinkSync(join(DIR, "set.json"));
  });

  test("bindK swaps an already used key and writes the file", (t) => {
    t.after(() => {
      Object.assign(S.keys, DKEYS);
      saveSets();
    });
    bindK("nx", "b");
    A.equal(S.keys.nx, "b");
    A.equal(S.keys.pv, "n", "the displaced action takes the old key");
    A.equal(fset().keys.nx, "b", "the change lands in set.json");
  });
});

describe("cycling values", () => {
  test("cycles wrap around and the accent applies live", (t) => {
    const ka = S.acc;
    const kl = S.lang;
    const kos = S.osk;
    const ksp = S.skp;
    t.after(() => {
      S.acc = ka;
      S.lang = kl;
      S.osk = kos;
      S.skp = ksp;
      applyAcc();
      saveSets();
    });
    nLang(1);
    A.equal(S.lang, "en");
    nLang(-1);
    A.equal(S.lang, "vi");
    nLang(-1);
    A.equal(S.lang, "de", "wraps backwards to the last language");
    nPal(1);
    A.equal(S.acc, PALS[1]![1], "the next palette");
    A.deepEqual([...pal.ACC], [80, 235, 150], "the accent color applies immediately");
    nNum("osk", -1);
    A.equal(S.osk, 25, "the step goes down");
    nNum("osk", -1);
    A.equal(S.osk, 10, "and wraps to the smallest");
    nNum("skp", 1);
    A.equal(S.skp, 10000, "the seek step goes up");
  });
});

describe("the settings screen", () => {
  test("it opens, closes, and takes the screen from the help menu", () => {
    setSt({ hlp: true });
    togSet();
    A.equal(gst().set, true, "opens");
    A.equal(gst().hlp, false, "the help menu closes");
    togSet();
    A.equal(gst().set, false, "closes again");
  });

  test("the selection moves and clamps at both ends", () => {
    togSet();
    sMov(3);
    A.equal(gst().sRow, 3, "moves down");
    sMov(-9);
    A.equal(gst().sRow, 0, "clamps at the top");
    sMov(99);
    A.equal(gst().sRow, SROWS.length - 1, "clamps at the bottom");
  });

  test("changing a value advances it and toasts the new value", (t) => {
    const kl = S.lang;
    t.after(() => {
      S.lang = kl;
      saveSets();
    });
    openRow(12);
    sChg(1);
    A.equal(S.lang, "en", "the language advances");
    A.equal(gst().tst?.s, "Translate to: English", "the toast names the new value");
  });

  test("enter on a single-key row rebinds it in one press", (t) => {
    t.after(() => {
      Object.assign(S.keys, DKEYS);
      saveSets();
    });
    openRow(0);
    sEnt();
    A.equal(gst().reb, true, "enter starts a rebind");
    A.deepEqual(gst().sQ, ["sp"], "the row queues its action");
    sBind("x");
    A.equal(S.keys.sp, "x", "the new key binds");
    A.equal(gst().reb, false, "a single key row finishes at once");
    A.equal(gst().tst?.s, "play / pause: x", "the toast names action and key");
  });

  test("a paired row queues both keys and escape cancels the second", (t) => {
    t.after(() => {
      Object.assign(S.keys, DKEYS);
      saveSets();
    });
    openRow(1);
    sEnt();
    A.deepEqual(gst().sQ, ["nx", "pv"], "a paired row queues both actions");
    sBind("1");
    A.equal(S.keys.nx, "1", "the first action binds");
    A.equal(gst().reb, true, "the second key is still pending");
    A.equal(gst().sQ[0], "pv", "the pending action waits in the queue");
    sBind("\x1b");
    A.equal(gst().reb, false, "escape cancels");
    A.equal(S.keys.pv, "b", "the pending action keeps its key");
  });
});

describe("the google ai key row", () => {
  const keep = (t: TestContext): void => {
    t.after(() => {
      S.aik = "";
      saveSets();
    });
  };

  test("enter opens an input that accumulates characters and deletes them", () => {
    openRow(13);
    sEnt();
    A.equal(gst().inp, "", "enter opens the input");
    sInp("A");
    sInp("I");
    sInp("z");
    A.equal(gst().inp, "AIz", "characters accumulate");
    sInp("\x7f");
    A.equal(gst().inp, "AI", "backspace deletes");
  });

  test("enter saves the key, toasts in English and writes the file", (t) => {
    keep(t);
    openRow(13);
    sEnt();
    sInp("A");
    sInp("I");
    sInp("b");
    sInp("\r");
    A.equal(S.aik, "AIb", "enter saves the key");
    A.equal(gst().inp, null, "the input closes");
    A.equal(gst().tst?.s, "Google AI key saved", "the toast is English");
    A.equal(fset().aik, "AIb", "the key lands in set.json");
  });

  test("escape cancels the input and keeps the stored key", (t) => {
    keep(t);
    S.aik = "AIb";
    openRow(13);
    sEnt();
    sInp("\x1b");
    A.equal(gst().inp, null, "escape cancels the input");
    A.equal(gst().tst?.s, "Input cancelled", "the cancel toasts");
    A.equal(S.aik, "AIb", "cancel keeps the old key");
  });

  test("an empty commit clears the key", (t) => {
    keep(t);
    S.aik = "AIb";
    openRow(13);
    sEnt();
    sInp("\r");
    A.equal(S.aik, "", "an empty commit clears the key");
    A.equal(gst().tst?.s, "Google AI key cleared", "clearing toasts");
  });

  test("arrow tokens are ignored and surrounding space is trimmed", (t) => {
    keep(t);
    openRow(13);
    sEnt();
    sInp("up");
    A.equal(gst().inp, "", "arrow tokens from a paste are ignored");
    sInp(" ");
    sInp("\r");
    A.equal(S.aik, "", "surrounding space is trimmed away");
  });
});
