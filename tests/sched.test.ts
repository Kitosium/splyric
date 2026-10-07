import { strict as A } from "node:assert";
import { describe, test } from "node:test";
import { BASE, mkPly } from "./helpers.ts";
import type { Lyr, Ply } from "../src/types/typ.ts";

const { mkClk } = await import("../src/core/clock.ts");
const { mkSch } = await import("../src/core/sched.ts");
const { setSt } = await import("../src/core/state.ts");
const { mono, slp } = await import("../src/utils/time.ts");

const stage = (ply: Ply, lyr: Lyr | null): void => setSt({ ply, lyr, ...BASE });

const oneLine = (t: number, s: string, w: string): Lyr => ({
  src: "t",
  wrd: true,
  ln: [{ t, s, w: [{ t, s: w }] }],
});

const rel = (rec: number[], t0: number): number[] => rec.map((x) => x - t0);

const trace = (r: number[]): string => r.map((x) => x.toFixed(0)).join(",");

describe("playing", () => {
  test("a render lands on the word boundary and keeps ticking", async () => {
    const clk = mkClk();
    const t0 = mono();
    clk.res(0, t0, true, 0);
    stage(mkPly(), oneLine(400, "word", "word"));
    const rec: number[] = [];
    const sch = mkSch(clk, () => rec.push(mono()));
    sch.wake();
    await slp(650);
    sch.stp();
    const r = rel(rec, t0);
    A.ok(
      r.some((x) => x >= 380 && x <= 500),
      `must render within [380,500] around word t=400 → ${trace(r)}`,
    );
    for (let i = 1; i < r.length; i++) {
      A.ok(r[i]! - r[i - 1]! <= 250, `gap ${r[i]! - r[i - 1]!}ms > 250`);
    }
  });

  test("a word past the end of the track still renders", async () => {
    const clk = mkClk();
    const t0 = mono();
    clk.res(59800, t0, true, 0);
    stage(mkPly({ dur: 60000 }), oneLine(60500, "see you later", "see"));
    const rec: number[] = [];
    const sch = mkSch(clk, () => rec.push(mono()));
    sch.wake();
    await slp(900);
    sch.stp();
    const r = rel(rec, t0);
    A.ok(
      r.some((x) => x >= 650),
      `word after dur (=60500 > dur) must still render → ${trace(r)}`,
    );
  });
});

describe("paused", () => {
  test("a paused track renders once on wake and then goes quiet", async () => {
    const clk = mkClk();
    clk.res(0, mono(), false, 0);
    stage(mkPly({ ply: false }), null);
    let n = 0;
    const sch = mkSch(clk, () => {
      n++;
    });
    sch.wake();
    await slp(350);
    sch.stp();
    A.equal(n, 1, "paused renders exactly once on wake");
  });

  test("a live toast keeps the screen awake until it expires", async () => {
    const clk = mkClk();
    clk.res(0, mono(), false, 0);
    stage(mkPly({ ply: false }), null);
    setSt({ tst: { s: "test", at: mono(), d: 500 } });
    let n = 0;
    const sch = mkSch(clk, () => {
      n++;
    });
    sch.wake();
    await slp(900);
    const c = n;
    A.ok(c >= 3, `toast ticked ${c} times (>= 3)`);
    await slp(300);
    A.equal(n, c, "toast expired → no more ticks");
    sch.stp();
    setSt({ tst: null });
  });
});
