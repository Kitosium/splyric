import { strict as A } from "node:assert";
import { describe, test } from "node:test";
import "./helpers.ts";

const { bigTxt } = await import("../src/interface/big.ts");

describe("pixel font", () => {
  test("every word renders at the same fixed 7-row height", () => {
    for (const t of ["HI", "hello", "thương", "Z", "outside"]) {
      const g = bigTxt(t, 76, 18)!;
      A.ok(g, `${t} renders`);
      A.equal(g.length, 7, `${t} = same height as every other word (7 rows)`);
    }
  });

  test("the scale is fixed per terminal size", () => {
    const hi = bigTxt("HI", 76, 18)!;
    A.equal(hi[0]!.length, 21, "width = 11·len − 1 at scale 2 (2 cols × 1 row pixels)");
    const wide = bigTxt("HI", 200, 30)!;
    A.equal(wide.length, 14, "wide + tall terminal → scale 4, still one fixed scale");
    A.equal(wide[0]!.length, 44, "width = 24·len − 4 at scale 4");
    for (let i = 0; i < wide.length; i += 2) {
      A.equal(wide[i], wide[i + 1], "scale 4 pixels are 4 cols × 2 rows (square)");
    }
  });

  test("letters are case- and diacritic-insensitive", () => {
    const b = bigTxt("hello", 76, 18)!;
    A.deepEqual(b, bigTxt("HELLO", 76, 18)!, "lowercase renders like uppercase");
    A.ok(bigTxt("đẹp quá", 76, 18), "diacritics stripped, word still renders");
    A.deepEqual(
      bigTxt("thương", 76, 18),
      bigTxt("thuong", 76, 18),
      "thương renders exactly like thuong (no marks, no taller letters)",
    );
    for (let i = 0; i < b.length; i++)
      A.equal(b[i]!.length, 54, "every glyph row has uniform width");
  });

  test("CJK, empty and hopeless words fall back to plain text", () => {
    A.equal(bigTxt("你好", 76, 18), null, "CJK → null (falls back to plain text)");
    A.equal(bigTxt("X".repeat(30), 76, 18), null, "too wide even squeezed → null");
    A.equal(bigTxt("", 76, 18), null, "empty → null");
    A.equal(bigTxt("structure", 44, 18), null, "no room even squeezed → plain text");
  });

  test("dots render trimmed, so they sit centered", () => {
    const dots = bigTxt("...", 76, 18, true)!;
    A.ok(dots, "dots render");
    A.equal(dots.length, 4, "blank rows trimmed so the dots sit centered");
  });

  test("long words squeeze horizontally instead of growing taller", () => {
    for (const t of ["mistake", "banana", "structure"]) {
      const g = bigTxt(t, 76, 18)!;
      A.ok(g, `${t} renders as pixels, not plain text`);
      A.equal(g.length, 7, `${t} = 7 rows like every other word`);
      A.ok(g[0]!.length <= 76, `${t} fits inside 76 cols`);
      for (const r of g) A.equal(r.length, g[0]!.length, `${t} rows share one width`);
    }
    A.equal(bigTxt("mistake", 76, 18)![0]!.length, 76, "mistake fits at the full scale");
    const sq = bigTxt("mistake", 60, 18)!;
    A.equal(sq.length, 7, "narrower terminal keeps the same height");
    A.equal(sq[0]!.length, 41, "half-width pixels squeeze 7 letters into 60 cols");
    const st = bigTxt("structure", 76, 18)!;
    A.equal(st.length, 7, "structure = same height as HI");
    A.equal(st[0]!.length, 53, "structure squeezed into 53 cols at scale 2");
    A.equal(bigTxt("structure", 56, 18)![0]!.length, 53, "structure still renders at 56 cols");
    const flat = bigTxt("ABCDEFGHIJKLMNO", 76, 18)!;
    A.equal(flat.length, 7, "15 letters: still 7 rows");
    A.equal(flat[0]!.length, 75, "gap closes to zero before giving up the big font");
  });
});
