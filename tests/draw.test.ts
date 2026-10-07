import { strict as A } from "node:assert";
import { describe, test } from "node:test";
import type { TestContext } from "node:test";
import "./helpers.ts";
import { diff, drw, entS, extS, rst } from "../src/interface/draw.ts";

const mk = (n: number, p: string): string[] => Array.from({ length: n }, (_, i) => `${p}${i}`);

const outRng = (s: string, h: number): boolean => {
  const m = /\x1b\[(\d+);1H/g;
  let x: RegExpExecArray | null;
  while ((x = m.exec(s))) if (Number(x[1]) > h) return true;
  return false;
};

const cap = (t: TestContext): string[] => {
  const P = process.stdout as unknown as { write: (s: string) => boolean };
  const orig = P.write;
  const chunks: string[] = [];
  P.write = (s: string): boolean => {
    chunks.push(String(s));
    return true;
  };
  entS();
  t.after(() => {
    extS();
    P.write = orig;
  });
  return chunks;
};

describe("diff", () => {
  test("returns only the rows that fit the screen", () => {
    const [, rows] = diff(mk(20, "new"), mk(30, "old"), 80, 20);
    A.equal(rows.length, 20, "keeps only rows inside the screen");
    A.equal(rows[19], "new19", "the last kept row holds the last line of the frame");
  });

  test("never clears rows beyond the screen", () => {
    const [out] = diff(mk(20, "new"), mk(30, "old"), 80, 20);
    A.ok(
      !outRng(out, 20),
      "no clear for rows the terminal clamped away (clamped clear would hit the last row)",
    );
    A.ok(out.includes("\x1b[20;1H"), "last row still drawn");
  });

  test("returns only the rows the frame fills", () => {
    const [, rows] = diff(mk(15, "new"), mk(30, "old"), 80, 20);
    A.equal(rows.length, 15, "rows stop at the end of the frame");
  });

  test("clears leftover rows inside the screen only", () => {
    const [out] = diff(mk(15, "new"), mk(30, "old"), 80, 20);
    A.ok(out.includes("\x1b[16;1H\x1b[2K"), "clears the first empty row inside the screen");
    A.ok(out.includes("\x1b[20;1H\x1b[2K"), "clears through the last row of the screen");
    A.ok(!outRng(out, 20), "no clear outside the screen");
  });

  test("draws every new row when the frame grows", () => {
    const [out, rows] = diff(mk(30, "new"), mk(20, "old"), 80, 30);
    A.equal(rows.length, 30, "every row up to the screen height is returned");
    A.ok(out.includes("\x1b[30;1H"), "last new row rendered");
  });

  test("writes nothing when the frame is unchanged", () => {
    const fr = mk(5, "x");
    const [out] = diff(fr, [...fr], 80, 24);
    A.equal(out, "", "an identical frame produces no output");
  });

  test("cuts by columns when the width changes", () => {
    const [out] = diff(["あ".repeat(100)], [], 10, 24);
    A.equal(out, `\x1b[1;1H\x1b[2K${"あ".repeat(5)}`, "10 columns = 5 CJK chars");
  });
});

describe("screen output", () => {
  test("drawing the same frame twice writes nothing", (t) => {
    const chunks = cap(t);
    drw(["a1", "b1"]);
    chunks.length = 0;
    drw(["a1", "b1"]);
    A.equal(chunks.join(""), "", "unchanged writes nothing (diff cache holds)");
  });

  test("rst clears the screen", (t) => {
    const chunks = cap(t);
    rst();
    A.ok(chunks.join("").includes("\x1b[2J"), "rst clears the screen");
  });

  test("after rst every row redraws", (t) => {
    const chunks = cap(t);
    drw(["a1", "b1"]);
    chunks.length = 0;
    rst();
    chunks.length = 0;
    drw(["a1", "b1"]);
    const o = chunks.join("");
    A.ok(o.includes("\x1b[1;1H") && o.includes("\x1b[2;1H"), "after rst every row redraws");
  });
});
