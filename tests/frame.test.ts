import { strict as A } from "node:assert";
import { beforeEach, describe, test } from "node:test";
import { BASE, colBefore, mkPly, strip } from "./helpers.ts";
import type { Aux, St } from "../src/types/typ.ts";

process.env.SPY_STYLE = "reveal";

const { bldFr } = await import("../src/interface/frame.ts");
const { vw } = await import("../src/interface/anim.ts");
const { setSt, gst } = await import("../src/core/state.ts");
const { S, applyAcc, nPal, saveSets } = await import("../src/core/set.ts");
const { pseLrc, bldL } = await import("../src/lyrics/lrc.ts");
const { cfg } = await import("../src/config/env.ts");
const { mono } = await import("../src/utils/time.ts");

cfg.aik = "";
S.aik = "";

const lyr = bldL(
  pseLrc("[00:01.00]the sky is blue today\n[00:05.00]we go outside now"),
  "t",
  false,
);

const EXP = Date.parse("2030-01-01T14:32:00");

const reset = (p: Partial<St> = {}): void => setSt({ ply: mkPly(), lyr, ...BASE, ...p });

beforeEach(() => reset());

const frame = (p: number, w = 80, h = 24) => bldFr(gst(), p, w, h);
const rows = (p: number): string[] => frame(p).rows;

const col = (r: string, word: string): number[] => {
  const i = r.indexOf(word);
  A.ok(i >= 0, `word "${word}" must show`);
  const c = colBefore(r, i);
  A.ok(c, `word "${word}" must have a color`);
  return c!;
};

const hot = (c: number[]): boolean => c[2] === 255 && c[1] >= 235;

const auxRows = (rom: boolean, vie: boolean, rl: Aux["rl"], vl: Aux["vl"]): void =>
  setSt({ aux: { rom, vie, det: "ja", rl, vl } });

describe("lyric view", () => {
  test("every word of the singing line shows", () => {
    const cur = rows(1500).find((r) => r.includes("the"));
    A.ok(cur, "current line must be there");
    for (const w of ["the", "sky", "is", "blue"])
      A.ok(cur!.includes(w), `word "${w}" must show (not blank)`);
  });

  test("words before the clock stay dark ghost", () => {
    const f1 = rows(1500);
    const cur1 = f1.find((r) => r.includes("the"))!;
    A.deepEqual(col(cur1, "sky"), [72, 72, 72], "not sung yet = dark ghost");
    const cur2 = rows(2500).find((r) => r.includes("the"))!;
    A.deepEqual(col(cur2, "blue"), [72, 72, 72], "not sung yet still ghost");
  });

  test("the word at the clock renders hot and advances with it", () => {
    const cur1 = rows(1500).find((r) => r.includes("the"))!;
    const c1 = col(cur1, "the");
    A.ok(hot(c1), `current must be hot (got ${c1})`);
    const cur2 = rows(2500).find((r) => r.includes("the"))!;
    const c2 = col(cur2, "is");
    A.ok(hot(c2), `current advances correctly (got ${c2})`);
  });

  test("already sung words settle to gray", () => {
    const cur2 = rows(2500).find((r) => r.includes("the"))!;
    A.deepEqual(col(cur2, "the"), [155, 155, 155], "already sung = gray");
  });

  test("a finished line stays in context and the next one shows complete", () => {
    const f = rows(7500);
    A.ok(
      f.some((r) => r.includes("today")),
      "previous line stays in context",
    );
    A.ok(
      f.some((r) => r.includes("now")),
      "next line shows when its turn comes",
    );
    A.ok(
      f.some((r) => r.includes("we") && r.includes("go")),
      "every word of the next line shows",
    );
  });

  test("highlight style paints future words bright", (t) => {
    t.after(() => {
      cfg.sty = "reveal";
    });
    cfg.sty = "highlight";
    const cur = rows(1500).find((r) => r.includes("the"))!;
    A.deepEqual(col(cur, "is"), [210, 210, 210], "future is bright in highlight");
  });

  test("no italic styling anywhere", () => {
    A.ok(
      !rows(7500).some((r) => r.includes("\x1b[3m")),
      "italic gone (context and lyric rows alike)",
    );
  });

  test("exactly one > marker, on the singing line only", () => {
    const f = rows(7500);
    const ctx = f.find((r) => r.includes("the"));
    A.ok(ctx && !ctx.includes(">"), "sung line sits in context without >");
    const cur = f.find((r) => r.includes(">"));
    A.ok(cur && cur.includes("now"), "> on the right line");
    A.equal(f.filter((r) => r.includes(">")).length, 1, "exactly one > per frame");
  });
});

describe("frame chrome", () => {
  test("no painted background anywhere", () => {
    const f = rows(1500);
    A.ok(!f.some((r) => r.includes("48;2")), "all painted backgrounds gone (48;2)");
  });

  test("the gutter and the border are gone", () => {
    const f = rows(1500);
    A.ok(!f.some((r) => strip(r).includes("┃")), "gutter ┃ fully gone");
    A.ok(!f.some((r) => strip(r).includes("│")), "thin │ border fully gone");
  });

  test("the title sits between blank rows, padded and cyan", () => {
    const f = rows(1500);
    A.equal(strip(f[0]!).trimEnd(), "", "blank row above title is only whitespace");
    A.ok(strip(f[1]!).startsWith("  "), "title padded 2 (no gutter)");
    A.equal(strip(f[1]!).indexOf("The Artist"), 2, "title content starts at column 3");
    A.ok(
      f[1]!.includes("The Artist") && f[1]!.includes("Nice Song"),
      "the title names artist and song",
    );
    A.ok(f[1]!.includes("38;2;110;235;255"), "title (artist — song) is cyan");
    A.ok(!f[1]!.includes("255;205;92"), "no amber left on the title");
    A.equal(strip(f[2]!).trimEnd(), "", "blank row below title is only whitespace");
  });

  test("the singing line marks itself at the left edge and aligns with the title", () => {
    const f = rows(1500);
    const cur = f.find((r) => r.includes(">"))!;
    A.equal(
      strip(cur).indexOf(">"),
      0,
      "singing line > at the left edge (replaces the 2-col indent)",
    );
    A.equal(strip(cur).indexOf("the"), 2, "lyric text aligned with title (column 3)");
    const nxt = f[4]!;
    A.ok(strip(nxt).startsWith("  we"), "normal line indented 2, aligned with title");
  });

  test("spacer rows carry no glyph", () => {
    const f = rows(1500);
    A.equal(strip(f[10]!).trimEnd(), "", "middle spacer row has no glyph");
    A.equal(strip(f[21]!).trimEnd(), "", "blank row above transport");
    A.equal(strip(f[23]!).trimEnd(), "", "blank row below transport is only whitespace");
  });

  test("transport: three buttons in order, starting at column 3", () => {
    const b = rows(1500)[22]!;
    A.equal(strip(b).indexOf("|◀"), 2, "transport starts at column 3 (no gutter)");
    A.ok(strip(b).endsWith("  "), "padding on the right");
    A.ok(b.includes("|◀"), "has skip-previous button");
    A.ok(b.includes("▮▮"), "playing → pause button");
    A.ok(b.includes("▶|"), "has skip-next button");
    A.ok(strip(b).indexOf("|◀") < strip(b).indexOf("▮▮"), "skip-previous before play/pause");
    A.ok(strip(b).indexOf("▮▮") < strip(b).indexOf("▶|"), "play/pause before skip-next");
  });

  test("transport: bar shaped ■/— with both times in the button gray", () => {
    const b = rows(1500)[22]!;
    A.ok(strip(b).includes("■") && strip(b).includes("—"), "bar shaped ■■———");
    A.ok(!strip(b).includes("["), "bar never uses []");
    A.ok(
      strip(b).includes("0:01") && strip(b).includes("1:00"),
      "elapsed + total both at the bottom",
    );
    const ti = b.indexOf("0:01");
    A.deepEqual(colBefore(b, ti), [122, 122, 122], "time text uses the same gray as the buttons");
  });

  test("the frame ends at the terminal height, without key hints", () => {
    const f = rows(1500);
    A.ok(!f.some((r) => r.includes("src:")), "bottom-left (src) row gone");
    A.ok(!f.some((r) => r.includes("space=")), "bottom key hints gone");
    A.equal(f.length, 24, "frame = exactly terminal height");
  });

  test("every row fills the terminal width at any size", () => {
    for (const w of [24, 30, 40, 60, 80]) {
      const f = frame(3000, w).rows;
      for (let i = 0; i < 24; i++) {
        A.ok(!f[i]!.includes("48;2"), `row ${i} w=${w} has no painted background`);
        A.equal(vw(f[i]!), w, `row ${i} w=${w} = full width`);
      }
    }
  });

  test("a paused track shows the play icon", () => {
    setSt({ ply: mkPly({ ply: false }) });
    A.ok(frame(1500).rows[22]!.includes("▶"), "paused shows ▶");
  });
});

describe("toast", () => {
  test("a toast sits right-aligned on the title row", () => {
    setSt({ tst: { s: "Offset +50ms", at: mono(), d: 3000 } });
    const f = frame(3000).rows;
    A.equal(
      f.findIndex((r) => r.includes("Offset +50ms")),
      1,
      "toast on the title row",
    );
    A.equal(
      strip(f[1]!).indexOf("Offset +50ms"),
      80 - 2 - "Offset +50ms".length,
      "toast right-aligned behind the side padding",
    );
    A.ok(
      strip(f[1]!).includes("The Artist — Nice Song"),
      "the title keeps the left side of the row",
    );
    A.ok(
      f.some((r) => strip(r).includes("sky is blue")),
      "lyrics stay visible during a toast",
    );
    A.ok(f[22]!.includes("0:03") && f[22]!.includes("1:00"), "transport keeps time during a toast");
    for (const r of f) A.equal(vw(r), 80, "every row padded to the terminal width");
  });

  test("an expired toast disappears while the lyrics keep showing", () => {
    setSt({ tst: { s: "Offset +50ms", at: mono() - 4000, d: 3000 } });
    const f = frame(3000).rows;
    A.ok(!f.some((r) => r.includes("Offset +50ms")), "expired toast is gone");
    A.ok(
      f.some((r) => r.includes("we go")),
      "lyrics keep showing after the toast",
    );
  });
});

describe("romaji and translation rows", () => {
  test("both rows hang under the singing line with ├ and ╰", () => {
    auxRows(true, true, ["sore wa uta"], ["đây là bài hát"]);
    const f = frame(1500).rows;
    const ri = f.findIndex((r) => strip(r).includes("├ sore wa uta"));
    const vi = f.findIndex((r) => strip(r).includes("╰ đây là bài hát"));
    A.ok(ri >= 3, "romaji row shows under the lyrics");
    A.equal(vi, ri + 1, "translation sits directly under the romaji");
    A.ok(strip(f[ri - 1]!).includes("sky is blue"), "the rows hang under the singing line");
    A.ok(f[ri]!.includes("38;2;122;122;122"), "romaji painted gray");
    A.equal(strip(f[ri]!).indexOf("├ sore wa uta"), 2, "starts at the lyric column");
    A.ok(!f.some((r) => strip(r).includes("(")), "no parentheses anywhere");
    for (const r of f) A.equal(vw(r), 80, "row padded to the terminal width");
    A.ok(!f.some((r) => r.includes("48;2")), "no background");
  });

  test("a lone romaji row closes the branch", () => {
    auxRows(true, false, ["sore wa uta"], ["đây là bài hát"]);
    const f = frame(1500).rows;
    A.ok(
      f.some((r) => strip(r).includes("╰ sore wa uta")),
      "a lone romaji row closes the branch",
    );
    A.ok(!f.some((r) => strip(r).includes("├")), "no dangling branch marker");
  });

  test("toggling both off hides the rows again", () => {
    auxRows(false, false, ["sore wa uta"], ["đây là bài hát"]);
    const f = frame(1500).rows;
    A.ok(!f.some((r) => strip(r).includes("sore wa uta")), "toggled off hides the romaji");
    A.ok(!f.some((r) => strip(r).includes("đây là bài hát")), "toggled off hides the translation");
  });

  test("the last line of a long song still leaves room for the branch rows", () => {
    const lns = Array.from(
      { length: 30 },
      (_, k) => `[00:${String(k + 1).padStart(2, "0")}.00]line ${k + 1}`,
    );
    const rl: (string | null)[] = lns.map(() => null);
    const vl: (string | null)[] = lns.map(() => null);
    rl[29] = "sore wa uta";
    vl[29] = "đây là bài hát";
    setSt({ lyr: bldL(pseLrc(lns.join("\n")), "t", false) });
    auxRows(true, true, rl, vl);
    const f = frame(30000).rows;
    const ri = f.findIndex((r) => strip(r).includes("├ sore wa uta"));
    const vi = f.findIndex((r) => strip(r).includes("╰ đây là bài hát"));
    A.ok(ri >= 0, "romaji row shows on the very last line");
    A.equal(vi, ri + 1, "translation directly under the romaji");
    A.ok(strip(f[ri - 1]!).includes("line 30"), "the rows hang under the singing line");
    A.ok(vi < f.length, "both rows fit inside the frame");
    for (const r of f) A.equal(vw(r), 80, "row padded to the terminal width");
    A.ok(!f.some((r) => r.includes("48;2")), "no background");
  });

  test("long aux rows break at spaces and keep the branch", () => {
    setSt({
      lyr: bldL(pseLrc("[00:01.00]心の中でカウントしてる (一、二、三)"), "t", false),
    });
    auxRows(
      true,
      true,
      ["kokoro no naka de kaunto shi teru ( ichi、 ni、 san )"],
      ["Tôi đang đếm trong đầu (một, hai, ba)"],
    );
    const rs = frame(1500, 40).rows.map(strip);
    const i = rs.findIndex((r) => r.includes("├ kokoro"));
    A.ok(i >= 0, "the romaji branch starts");
    A.ok(rs[i - 1]!.includes("心の中でカウントしてる"), "it hangs under the singing line");
    A.equal(
      rs[i]!.trimEnd(),
      "  ├ kokoro no naka de kaunto shi teru",
      "the break lands on a space, never inside a word",
    );
    A.equal(rs[i + 1]!.trimEnd(), "  │ ( ichi、 ni、 san )", "the branch continues with │");
    A.equal(
      rs[i + 2]!.trimEnd(),
      "  ╰ Tôi đang đếm trong đầu (một, hai,",
      "the translation breaks on a space too",
    );
    A.equal(rs[i + 3]!.trimEnd(), "    ba)", "the tail sits on its own row");
    A.ok(!rs[i]!.includes("( ichi"), "nothing from the next word leaks up");
    for (const r of rs) A.equal(vw(r), 40, "every row padded to the terminal width");
    A.ok(!rs.some((r) => r.includes("48;2")), "no background");
  });
});

describe("mouse geometry", () => {
  test("three buttons and the seek bar sit on the transport row", () => {
    const { geo } = frame(3000);
    A.equal(geo.btn.length, 3, "all 3 buttons");
    const pv = geo.btn.find((x) => x.id === "pv")!;
    A.equal(pv.x, 3, "first button at column 3 (after padding, no gutter)");
    A.equal(pv.y, 23, "buttons on the transport row (last − 1)");
    A.equal(geo.bar.y, 23, "the seek bar shares that row");
    A.ok(geo.bar.w > 0, "the bar spans some columns");
  });
});

describe("empty states", () => {
  test("no track: the message sits in the middle of the screen", () => {
    reset({ ply: null, lyr: null });
    const f = frame(0).rows;
    const hit = f.findIndex((r) => r.includes("No track playing"));
    const t = "No track playing";
    A.equal(hit, 11, "no-track message vertically centered");
    A.equal(strip(f[hit]!).indexOf(t), (80 - t.length) >> 1, "message horizontally centered");
  });

  test("searching: the loading message sits in the middle of the screen", () => {
    reset({ lyr: null, ldg: true });
    const f = frame(0).rows;
    const t = "Searching for lyrics...";
    const hit = f.findIndex((r) => r.includes(t));
    A.equal(hit, 11, "loading message vertically centered");
    A.equal(strip(f[hit]!).indexOf(t), (80 - t.length) >> 1, "message horizontally centered");
  });

  test("no match: the missing message sits in the middle of the screen", () => {
    reset({ lyr: null, ldg: false });
    const f = frame(0).rows;
    const t = "No lyrics found";
    const hit = f.findIndex((r) => r.includes(t));
    A.equal(hit, 11, "missing-lyrics message vertically centered");
    A.equal(strip(f[hit]!).indexOf(t), (80 - t.length) >> 1, "message horizontally centered");
  });

  test("an error toast lands on the title row while the lyrics keep showing", () => {
    setSt({ tst: { s: "Net error — retrying", at: mono(), d: 5000 } });
    const f = frame(1500).rows;
    A.equal(
      f.findIndex((r) => r.includes("Net error")),
      1,
      "error toast on the title row",
    );
    A.ok(
      f.some((r) => strip(r).includes("sky is blue")),
      "lyrics stay while the error toast shows",
    );
  });
});

describe("word view", () => {
  test("the current word renders as a centered 7-row pixel glyph", () => {
    setSt({ view: "word" });
    const f = frame(1500).rows;
    const gl = f.filter((r) => r.includes("█"));
    A.equal(gl.length, 7, "big glyph = 7 rows (the one fixed scale for this terminal)");
    A.equal(f.indexOf(gl[0]!), 8, "glyph block vertically centered (top row 8)");
    for (const r of gl) A.equal(vw(r), 80, "glyph row padded to terminal width");
    A.equal(strip(gl[0]!).indexOf("█"), 24, "glyph block horizontally centered (left 24)");
    const m = [...gl[0]!.matchAll(/38;2;(\d+);(\d+);(\d+)m/g)];
    A.ok(m.length >= 1, "glyph rows carry a color");
    A.deepEqual(
      [+m[0]![1]!, +m[0]![2]!, +m[0]![3]!],
      [255, 255, 255],
      "big word is always plain white (no cyan)",
    );
    A.ok(!f.some((r) => r.includes(">")), "no > marker in word view");
    A.ok(f[22]!.includes("▮▮") && f[22]!.includes("0:01"), "transport stays in word view");
    A.ok(!f.some((r) => r.includes("48;2")), "word view paints no background");
  });

  test("before the first word the glyph shows three big dots", () => {
    setSt({ view: "word" });
    const f0 = frame(0).rows;
    A.equal(
      f0.filter((r) => r.includes("█")).length,
      4,
      "before the first word → three big dots, trimmed to center",
    );
  });

  test("every row keeps the full width on any terminal size", () => {
    setSt({ view: "word" });
    for (const w of [24, 40, 80]) {
      for (const h of [7, 10, 24]) {
        for (const r of frame(1500, w, h).rows) {
          A.equal(vw(r), Math.max(24, w), `word view row full width (w=${w} h=${h})`);
        }
      }
    }
  });

  test("a Vietnamese word loses its marks but keeps the usual height", () => {
    setSt({
      lyr: bldL(pseLrc("[00:01.00]thương em nhiều\n[00:05.00]về nơi xa ấy"), "t", false),
      view: "word",
    });
    const f = frame(1500).rows;
    const gl = f.filter((r) => r.includes("█"));
    A.equal(gl.length, 7, "thương → THUONG: no mark rows, 7 rows like every word");
    A.equal(strip(gl[0]!).indexOf("█"), 7, "glyph block horizontally centered");
    A.ok(!f.some((r) => r.includes("48;2")), "no background in word view");
    for (const r of gl) A.equal(vw(r), 80, "glyph row padded to terminal width");
    const gl2 = frame(4000).rows.filter((r) => r.includes("█"));
    A.equal(gl2.length, gl.length, "nhiều → NHIEU: longer word, same height");
  });

  test("a long word squeezes instead of falling back to plain text", () => {
    setSt({ lyr: bldL(pseLrc("[00:01.00]structure"), "t", false), view: "word" });
    const f = frame(1500).rows;
    const gl = f.filter((r) => r.includes("█"));
    A.equal(gl.length, 7, "structure = 7 rows, exactly like a short word");
    for (const r of gl) A.equal(vw(r), 80, "squeezed glyph row padded to terminal width");
    A.equal(strip(gl[6]!).indexOf("█"), 13, "squeezed block centered (53 cols → left 13)");
    A.equal(strip(gl[6]!).lastIndexOf("█"), 65, "right edge at 65 (13 + 53 − 1)");
    A.ok(!f.some((r) => r.includes("48;2")), "no background in word view");
  });
});

describe("keyboard menu", () => {
  test("h opens it: centered heading, cyan, full-width rows", () => {
    const off = frame(1500).rows;
    A.ok(!off.some((r) => r.includes("Keyboard")), "menu hidden until h is pressed");
    setSt({ hlp: true });
    const f = frame(1500).rows;
    const head = f.find((r) => r.includes("Keyboard"));
    A.ok(head, "heading shows");
    A.ok(head!.includes("38;2;110;235;255mKeyboard"), "heading is cyan");
    A.equal(strip(head!).trim(), "Keyboard", "heading centered on its row");
    for (const r of f) A.equal(vw(r), 80, "menu rows padded to terminal width");
    A.ok(!f.some((r) => r.includes("48;2")), "no background in the menu");
  });

  test("every shortcut is listed, key names white", () => {
    setSt({ hlp: true });
    const f = frame(1500).rows;
    const key = f.find((r) => strip(r).trim().startsWith("space"));
    A.ok(key, "the space row shows");
    A.ok(key!.includes("38;2;255;255;255mspace"), "key names are white");
    const plain = f.map(strip);
    A.ok(
      plain.some((r) => r.trim() === "space  play / pause"),
      "space row in the key column",
    );
    A.ok(
      plain.some((r) => /^tab\s+toggle word view$/.test(r.trim())),
      "tab row present",
    );
    A.ok(
      plain.some((r) => /^r\s+toggle romaji \/ pinyin$/.test(r.trim())),
      "r row present",
    );
    A.ok(
      plain.some((r) => /^t\s+toggle Vietnamese translation$/.test(r.trim())),
      "t row present",
    );
    A.ok(
      plain.some((r) => /^q\s+quit$/.test(r.trim())),
      "q row present",
    );
    A.ok(
      plain.some((r) => r.includes("offset +50ms / −50ms")),
      "offset row present",
    );
  });

  test("the menu shows over an empty screen and over the word view", () => {
    setSt({ hlp: true, ply: null });
    A.ok(
      frame(1500).rows.some((r) => r.includes("Keyboard")),
      "menu shows even with no track playing",
    );
    setSt({ ply: mkPly(), view: "word" });
    A.ok(
      frame(1500).rows.some((r) => r.includes("Keyboard")),
      "menu shows over the word view too",
    );
  });

  test("a live toast lands on the title row while the menu stays", () => {
    setSt({ hlp: true, tst: { s: "Playing", at: mono(), d: 3000 } });
    const ft = frame(1500).rows;
    A.equal(
      strip(ft[1]!).indexOf("Playing"),
      80 - 2 - "Playing".length,
      "live toast on the title row",
    );
    A.ok(
      ft.some((r) => r.includes("Keyboard")),
      "the menu stays visible under a toast",
    );
  });

  test("the menu reflects rebound keys, steps and the target language", (t) => {
    const ko = S.osk;
    const kl = S.lang;
    t.after(() => {
      S.osk = ko;
      S.lang = kl;
    });
    S.osk = 100;
    S.lang = "en";
    setSt({ hlp: true });
    const f = frame(0).rows.map(strip);
    A.ok(
      f.some((r) => r.includes("offset +100ms / −100ms")),
      "the offset step comes from settings",
    );
    A.ok(
      f.some((r) => r.includes("toggle English translation")),
      "the translation row names the target language",
    );
    A.ok(
      f.some((r) => r.includes("open settings")),
      "the settings shortcut is listed",
    );
    A.ok(
      f.some((r) => r.includes("open the account screen")),
      "the account shortcut is listed",
    );
  });
});

describe("settings screen", () => {
  test("it lists the language, the keys, the ai key and the steps", () => {
    setSt({ set: true });
    const f = frame(1500).rows;
    const pl = f.map(strip);
    A.ok(
      pl.some((r) => r.includes("Settings")),
      "heading shows",
    );
    A.ok(
      pl.some((r) => r.includes("> play / pause")),
      "the first row is selected",
    );
    A.ok(
      pl.some((r) => r.includes("translate to")),
      "the language row shows",
    );
    A.ok(
      pl.some((r) => r.includes("google ai key")),
      "the google ai key row shows",
    );
    A.ok(
      pl.some((r) => r.includes("not set")),
      "an empty key reads as not set",
    );
    A.ok(
      pl.some((r) => r.includes("Vietnamese")),
      "the current language shows",
    );
    A.ok(
      pl.some((r) => r.includes("offset step")),
      "the step rows show",
    );
    A.ok(!f.some((r) => r.includes("48;2")), "no background");
    for (const r of f) A.equal(vw(r), 80, "settings rows padded to terminal width");
  });

  test("picking an accent paints the title right away", (t) => {
    const ka = S.acc;
    t.after(() => {
      S.acc = ka;
      applyAcc();
      saveSets();
    });
    nPal(1);
    A.ok(
      frame(1500).rows[1]!.includes("38;2;80;235;150m"),
      "a picked accent paints the title right away",
    );
  });

  test("the selection moves down the list", () => {
    setSt({ set: true, sRow: 12 });
    A.ok(
      frame(1500)
        .rows.map(strip)
        .some((r) => r.includes("> translate to")),
      "selection moves down the list",
    );
  });

  test("a pending rebind asks for its action", () => {
    setSt({ set: true, reb: true, sQ: ["pv"], sRow: 1 });
    A.ok(
      frame(1500)
        .rows.map(strip)
        .some((r) => r.includes("press a key")),
      "the pending rebind asks for its action",
    );
  });

  test("the list scrolls into a short screen", () => {
    setSt({ set: true, sRow: 16 });
    const sm = frame(1500, 80, 14).rows.map(strip);
    A.ok(
      sm.some((r) => r.includes("> seek step")),
      "the selection scrolls into a short screen",
    );
  });

  test("the ai key input starts with a hint, then shows a cursor", () => {
    setSt({ set: true, sRow: 13, inp: "" });
    const ep = frame(1500).rows.map(strip);
    setSt({ inp: "AIza" });
    const ty = frame(1500).rows.map(strip);
    A.ok(
      ep.some((r) => r.includes("type, enter saves, esc cancels")),
      "an empty input explains itself",
    );
    A.ok(
      ty.some((r) => r.includes("AIza▌")),
      "typed characters show with a cursor",
    );
  });

  test("a saved key masks itself and an env key reads as a fallback", (t) => {
    const ka = S.aik;
    const ke = cfg.aik;
    t.after(() => {
      S.aik = ka;
      cfg.aik = ke;
    });
    setSt({ set: true, inp: null });
    S.aik = "AIzaSyTESTKEY12345";
    const skey = frame(1500).rows.map(strip);
    A.ok(
      skey.some((r) => r.includes("****2345")),
      "a saved key shows masked",
    );
    S.aik = "";
    cfg.aik = "AIzaENVKEY0009";
    const ekey = frame(1500).rows.map(strip);
    A.ok(
      ekey.some((r) => r.includes("env ****0009")),
      "an env key reads as a masked fallback",
    );
  });

  test("settings open without a track", () => {
    setSt({ set: true, ply: null });
    A.ok(
      frame(1500)
        .rows.map(strip)
        .some((r) => r.includes("Settings")),
      "settings open without a track too",
    );
  });

  test("the settings block stays centered when the terminal grows", () => {
    setSt({ set: true, sRow: 0 });
    const sh = frame(1500, 80, 24).rows.map(strip);
    A.equal(
      sh.findIndex((r) => r.includes("Settings")),
      3,
      "a screen too short for the block scrolls from the top",
    );
    const tal = frame(1500, 80, 30).rows.map(strip);
    const ti = tal.findIndex((r) => r.includes("Settings"));
    A.equal(ti, 5, "a taller screen centers the block vertically");
    A.ok(
      tal.slice(3, ti).every((r) => r.trim() === ""),
      "blank rows above it",
    );
    A.ok(
      tal.slice(ti + 19, 27).every((r) => r.trim() === ""),
      "blank rows below it",
    );
    for (const r of tal) A.equal(vw(r), 80, "every row padded to the terminal width");
  });
});

describe("login and account screens", () => {
  test("signed out: a heading and a call to action replace the empty state", () => {
    setSt({ ses: "out", ply: null });
    const o = frame(1500).rows.map(strip);
    A.ok(
      o.some((r) => r.includes("Not signed in")),
      "the signed-out heading shows",
    );
    A.ok(
      o.some((r) => r.includes("press l or enter to sign in")),
      "the call to action names the key",
    );
    A.ok(
      !o.some((r) => r.includes("No track playing")),
      "the login screen replaces the empty state",
    );
    for (const r of o) A.equal(vw(r), 80, "login rows padded to terminal width");
  });

  test("waiting: the url wraps across rows but stays whole", () => {
    const url =
      "https://accounts.spotify.com/authorize?client_id=abcdef123456&code_challenge=xyz&scope=read";
    setSt({ ses: "wait", lnk: url });
    const wt = frame(1500).rows.map(strip);
    A.ok(
      wt.some((r) => r.includes("Signing in")),
      "the waiting heading shows",
    );
    A.ok(
      wt.some((r) => r.includes("client_id=abcdef123456")),
      "the url wraps across rows",
    );
    A.ok(
      wt
        .map((r) => r.trim())
        .join("")
        .includes(url),
      "the whole url is on screen without gaps",
    );
    A.ok(
      wt.some((r) => r.includes("esc cancel")),
      "cancel is listed",
    );
    A.ok(
      wt.some((r) => r.includes("p paste the redirect URL")),
      "paste is listed",
    );
  });

  test("paste mode: the typed redirect url shows with a submit hint", () => {
    setSt({ ses: "wait", pst: "https://127.0.0.1:8889/callback?code=x" });
    const ps = frame(1500).rows.map(strip);
    A.ok(
      ps.some((r) => r.includes("Paste the redirect URL")),
      "the paste heading shows",
    );
    A.ok(
      ps.some((r) => r.includes("callback?code=x")),
      "the typed text shows",
    );
    A.ok(
      ps.some((r) => r.includes("enter submit")),
      "submit is listed",
    );
  });

  test("account: profile, expiry as local time, sign out marked", () => {
    setSt({ me: true, usr: "DJ Nova", exp: EXP });
    const ac = frame(1500).rows.map(strip);
    A.ok(
      ac.some((r) => r.includes("Account")),
      "the account heading shows",
    );
    A.ok(
      ac.some((r) => r.includes("signed in as")),
      "the profile row shows",
    );
    A.ok(
      ac.some((r) => r.includes("DJ Nova")),
      "the display name shows",
    );
    A.ok(
      ac.some((r) => r.includes("session expires")),
      "the expiry row shows",
    );
    A.ok(
      ac.some((r) => r.includes("14:32")),
      "the expiry reads as a local time",
    );
    A.ok(
      ac.some((r) => r.includes("> sign out")),
      "the sign out row carries the marker",
    );
    for (const r of ac) A.equal(vw(r), 80, "account rows padded to terminal width");
  });

  test("signed out, the login screen wins over the account screen", () => {
    setSt({ ses: "out", me: true });
    const hid = frame(1500).rows.map(strip);
    A.ok(!hid.some((r) => r.includes("Account")), "signed out hides the account screen");
    A.ok(
      hid.some((r) => r.includes("Not signed in")),
      "the login screen wins",
    );
  });
});

describe("wide scripts", () => {
  test("japanese lyrics never overflow the terminal", () => {
    const jlyr = bldL(
      pseLrc(
        "[00:01.00]あなたはろくでもないと言うけど\n" +
          "[00:04.00]大切なものをわたしにくれたでしょ\n" +
          "[00:08.00]天文学的方程を解きたいんだ 宇宙の法則すら\n" +
          "[00:12.00]無視してしまうこの心が 忘れてしまいたいよ",
      ),
      "t",
      false,
    );
    setSt({ ply: mkPly({ nm: "AIYOU", ar: "Eve" }), lyr: jlyr });
    for (const w of [40, 60, 80]) {
      for (const p of [1500, 5000, 9500]) {
        for (const r of frame(p, w).rows) {
          A.ok(vw(r) <= w, `row width ${vw(r)} > ${w} (p=${p})`);
        }
      }
    }
    const f = frame(9500, 40).rows;
    A.equal(vw(f[22]!), 40, "transport row exactly full width");
    A.ok(f[22]!.includes("0:09"), "time not lost");
    A.ok(
      f.some((r) => r.includes(">")),
      "current line is marked",
    );
  });
});

const many = bldL(
  pseLrc(
    Array.from(
      { length: 40 },
      (_, i) =>
        `[00:${String(i + 1).padStart(2, "0")}.00]line ${String(i).padStart(2, "0")} sings on time`,
    ).join("\n"),
  ),
  "t",
  false,
);

describe("auto-scroll", () => {
  test("at the start the lyrics show from the top, unmarked", () => {
    setSt({ lyr: many });
    const f0 = frame(0).rows.map(strip);
    A.ok(f0[3]!.includes("line 00"), "nothing sung yet → lyrics show from the top");
    A.ok(
      f0.some((r) => r.includes("line 17")),
      "frame overflows → line 17 visible",
    );
    A.ok(!f0.some((r) => r.includes("line 39")), "not scrolled → last line not visible yet");
    A.ok(!f0.some((r) => r.includes(">")), "no line reached yet → no >");
  });

  test("mid-song the singing line holds the middle of the frame", () => {
    setSt({ lyr: many });
    const f1 = frame(19500).rows.map(strip);
    A.ok(f1[12]!.includes(">") && f1[12]!.includes("line 18"), "line 18 held mid-frame (row 12)");
    A.ok(!f1.some((r) => r.includes("line 00")), "scrolled past the top");
    A.ok(!f1.some((r) => r.includes("line 39")), "not at the end yet");
  });

  test("the end clamps to the bottom with the marker on the last line", () => {
    setSt({ lyr: many });
    const f2 = frame(40500).rows.map(strip);
    A.ok(
      f2[20]!.includes(">") && f2[20]!.includes("line 39"),
      "end of song → clamped to the bottom, > on the last line",
    );
    A.ok(!f2.some((r) => r.includes("line 00")), "start of the song scrolled out of frame");
    A.equal(f2.filter((r) => r.includes(">")).length, 1, "still exactly one >");
  });
});

describe("performance", () => {
  test("a 200-line song renders inside the 100ms frame budget", () => {
    const lns: string[] = [];
    for (let i = 0; i < 200; i++) {
      const m = String(Math.floor(i / 4)).padStart(2, "0");
      const s = String((i % 4) * 15).padStart(2, "0");
      lns.push(`[${m}:${s}.00]line ${i} has many words to test word wrap${i}`);
    }
    setSt({ lyr: bldL(pseLrc(lns.join("\n")), "t", false) });
    for (let i = 0; i < 20; i++) frame(1000 + i * 137);
    const ts: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      frame(1000 + i * 137);
      ts.push(performance.now() - t0);
    }
    ts.sort((a, b) => a - b);
    A.ok(ts[49]! < 10, `p50 = ${ts[49]!.toFixed(2)}ms (smooth)`);
    A.ok(ts[99]! < 100, `p99 = ${ts[99]!.toFixed(2)}ms (within the 100ms budget)`);
  });
});
