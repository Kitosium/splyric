import { strict as A } from "node:assert";
import { describe, test } from "node:test";
import "./helpers.ts";
import { SLEW_MS } from "../src/config/const.ts";
import { mkClk } from "../src/core/clock.ts";

const mk = (o = 0) => {
  const c = mkClk();
  c.res(0, 0, true, o);
  return c;
};

describe("position", () => {
  test("extrapolates between anchors", () => {
    const c = mkClk();
    c.res(1000, 10000, true, 0);
    A.equal(c.pos(12000), 3000, "two seconds after the anchor the position advanced two seconds");
  });
});

describe("pause and resume", () => {
  test("a paused clock holds its position", () => {
    const c = mk();
    c.setP(false, 5000);
    A.equal(c.pos(9000), 5000, "time passing while paused does not move the position");
  });

  test("play resumes from the pause point", () => {
    const c = mk();
    c.setP(false, 5000);
    c.setP(true, 9000);
    A.equal(c.pos(10000), 6000, "one second after resuming the position advanced one second");
  });
});

describe("anchor correction", () => {
  test("a large seek snaps immediately", () => {
    const c = mk();
    c.anc(30000, 10500);
    A.equal(c.pos(10500), 30000, "the anchor applies at the very moment it is set");
    A.ok(Math.abs(c.pos(11500) - 31000) < 1, "the position keeps advancing after the snap");
  });

  test("a small drift slews continuously", () => {
    const c = mk();
    const b = c.pos(2000);
    c.anc(b + 400, 2000);
    A.equal(c.pos(2000), b, "a small correction does not jump the position");
    A.ok(c.pos(2000 + SLEW_MS) >= b + 399, "the correction is absorbed over SLEW_MS");
  });
});

describe("offset", () => {
  test("reset stores the offset it is given", () => {
    const c = mkClk();
    c.res(0, 0, true, 150);
    A.equal(c.getO(), 150, "res keeps the offset it was called with");
  });

  test("setO replaces the stored offset", () => {
    const c = mk(150);
    c.setO(-50);
    A.equal(c.getO(), -50, "setO overwrites the offset stored by res");
  });
});
