import { strict as A } from "node:assert";
import { describe, test } from "node:test";
import { strip } from "./helpers.ts";

const { wd, vw, mx, cut, bt } = await import("../src/interface/anim.ts");
const { cfg } = await import("../src/config/env.ts");

describe("button states", () => {
  test("idle is light gray, hover is white, press is inverse", () => {
    A.equal(bt("▮▮", 0), "\x1b[38;2;122;122;122m▮▮\x1b[0m", "idle = light gray");
    A.ok(bt("▮▮", 1).includes("38;2;255;255;255"), "hover = white");
    A.ok(bt("▮▮", 2).includes("\x1b[7m"), "press = inverse (feedback)");
    for (const st of [0, 1, 2]) {
      A.ok(!bt("▮▮", st).includes("110;235;255"), `st=${st} has no accent left`);
    }
  });
});

describe("word colors", () => {
  test("a word goes ghost, pops white, burns hot, then settles gray", () => {
    A.deepEqual(wd(-100, false, false), [72, 72, 72], "negative age = ghost");
    A.deepEqual(wd(-1, true, false), [72, 72, 72], "not yet due = ghost");
    A.deepEqual(wd(0, true, false), [255, 255, 255], "age 0 = white (pop start)");
    const mid = wd(200, true, false);
    A.ok(mid[0]! > 150 && mid[0]! < 255, `mid-pop = gradual (got ${mid})`);
    const cur = wd(500, true, false);
    A.equal(cur[2], 255, "current keeps B=255");
    A.ok(cur[1]! >= 235 && cur[1]! <= 255, `current G is hot (got ${cur})`);
    const old = wd(3000, false, false);
    A.deepEqual(old, [155, 155, 155], "sung long = gray");
    const hgh = wd(-5, false, true);
    A.deepEqual(hgh, [210, 210, 210], "highlight mode = bright");
  });

  test("the color never jumps when branches switch", () => {
    for (const age of [0, 100, 399, 401, 800, 1200]) {
      const a = wd(age, true, false);
      const b = wd(age + 1, true, false);
      const d = Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));
      A.ok(d <= 3, `age=${age} → jumps ${d} units within 1ms`);
    }
  });
});

describe("visible width", () => {
  test("ANSI escapes never count toward the width", () => {
    A.equal(vw("\x1b[38;2;1;2;3mhi there\x1b[0m"), 8);
    A.equal(vw("\x1b[38;2;110;235;255mあなた\x1b[0m"), 6, "ANSI does not count toward width");
  });

  test("CJK takes two columns, combining marks take none", () => {
    A.equal(vw("あなたは"), 8, "hiragana = 2 columns per char");
    A.equal(vw("形だけ 今日に成る"), 17, "CJK + space");
    A.equal(vw("AIYOU"), 5, "ASCII = 1 column");
    A.equal(vw("e\u0301"), 1, "combining char = 0 columns");
  });

  test("SPY_AMB=2 gives ambiguous characters two columns", () => {
    const old = cfg.amb;
    A.equal(vw("■"), 1, "default ■ = 1 column");
    cfg.amb = 2;
    try {
      A.equal(vw("■"), 2, "amb=2 → ■ = 2 columns");
      A.equal(vw("あ"), 2, "CJK still 2");
    } finally {
      cfg.amb = old;
    }
  });
});

describe("color mixing", () => {
  test("mx clamps an over-eager mix", () => {
    A.equal(mx([0, 0, 0], [100, 100, 100], 2)[0], 100, "clamp k>1");
  });
});

describe("cutting", () => {
  test("cut cuts by columns and never leaves an open escape", () => {
    A.equal(cut("abcdef", 3), "abc");
    A.equal(cut("あいうえお", 6), "あいう", "cuts by column width");
    const s = `\x1b[38;2;1;2;3m${"あ".repeat(60)}\x1b[0m`;
    const c = cut(s, 10);
    A.equal(vw(c), 10, "row after cut = exact width");
    A.ok(c.endsWith("\x1b[0m"), "cut inside a color → reset appended");
    A.ok(!strip(c).includes("\x1b"), "no orphan escapes left");
    A.equal(
      cut(`\x1b[38;2;1;2;3mabc\x1b[0m`, 10),
      `\x1b[38;2;1;2;3mabc\x1b[0m`,
      "fits exactly → unchanged",
    );
  });
});
