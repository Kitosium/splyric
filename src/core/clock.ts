import { DRF_A, DRF_HI, DRF_LO, SEEK_TH, SLEW_MS, SNAP_TH } from "../config/const.ts";
import type { Clk } from "../types/typ.ts";

export const mkClk = (): Clk => {
  let p0 = 0;
  let t0 = 0;
  let r = 1;
  let of = 0;
  let ov = 0;
  let ot = 0;
  let orr = 1;
  let ct = -1;
  let pv = 0;
  let pt = 0;
  let inn = false;

  const pos = (t: number): number => {
    const nv = p0 + r * (t - t0);
    if (ct < 0) return nv;
    const k = Math.min(1, (t - ct) / SLEW_MS);
    if (k >= 1) return nv;
    return (1 - k) * (ov + orr * (t - ot)) + k * nv;
  };

  const anc = (p: number, t: number): void => {
    if (!inn) {
      p0 = p;
      t0 = t;
      pv = p;
      pt = t;
      inn = true;
      return;
    }
    const cur = pos(t);
    const dt = t - pt;
    const dp = p - pv;
    const sk = Math.abs(dp - dt) > SEEK_TH;
    if (!sk && dt > 100 && r > 0) {
      const ro = dp / dt;
      if (Math.abs(ro - 1) <= 0.25) {
        r = Math.min(DRF_HI, Math.max(DRF_LO, r + DRF_A * (ro - r)));
      }
    }
    const df = p - cur;
    if (sk || Math.abs(df) > SNAP_TH) {
      ct = -1;
    } else {
      ov = cur;
      ot = t;
      orr = r;
      ct = t;
    }
    p0 = p;
    t0 = t;
    pv = p;
    pt = t;
  };

  const setP = (b: boolean, t: number): void => {
    const v = pos(t);
    p0 = v;
    t0 = t;
    ct = -1;
    r = b ? 1 : 0;
    pv = v;
    pt = t;
    inn = true;
  };

  const res = (p: number, t: number, b: boolean, o: number): void => {
    p0 = p;
    t0 = t;
    r = b ? 1 : 0;
    of = o;
    ct = -1;
    pv = p;
    pt = t;
    inn = true;
  };

  const setO = (o: number): void => {
    of = o;
  };
  const getO = (): number => of;
  const rat = (): number => r;

  return { anc, pos, setP, setO, getO, res, rat };
};
