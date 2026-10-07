import { gtMe, mkFlow, outSes, readyTk, rfNw, tkExists } from "./api/auth.ts";
import type { Flow } from "./api/auth.ts";
import { fchPly, nxtPly, plyCmd, prvPly, sekPly } from "./api/play.ts";
import type { Pout } from "./api/play.ts";
import { BKO_MAX, ERR_D } from "./config/const.ts";
import { cfg } from "./config/env.ts";
import { mkClk } from "./core/clock.ts";
import { mkSch } from "./core/sched.ts";
import {
  gst,
  nAux,
  say,
  setSt,
  sBind,
  sChg,
  sEnt,
  sInp,
  sMov,
  sub,
  togHlp,
  togMe,
  togSet,
  togView,
} from "./core/state.ts";
import { logErr, logInf, logWrn, setScr } from "./errors/log.ts";
import { Herr } from "./utils/http.ts";
import { gOff, sOff } from "./lyrics/cache.ts";
import { bldLyr } from "./lyrics/pipe.ts";
import { pressRom, pressVie, warm } from "./lyrics/aux.ts";
import { bldFr } from "./interface/frame.ts";
import type { Geo } from "./interface/frame.ts";
import { drw, entS, extS, rst } from "./interface/draw.ts";
import { entK, extK } from "./interface/keys.ts";
import type { Kbd } from "./interface/keys.ts";
import { fmtO, fmtT, mono } from "./utils/time.ts";
import type { Clk, Ply } from "./types/typ.ts";

let qit = false;
let at = "";
let rel: (() => void) | null = null;
let ask: (() => void) | null = null;
let asked = false;
let fl: Flow | null = null;

const slI = (ms: number): Promise<void> =>
  new Promise((r) => {
    const t = setTimeout(() => {
      rel = null;
      r();
    }, ms);
    rel = () => {
      clearTimeout(t);
      rel = null;
      r();
    };
  });

const kk = (): void => rel?.();

const gate = (): Promise<void> => {
  if (asked) return Promise.resolve();
  return new Promise((r) => {
    ask = () => {
      ask = null;
      rel = null;
      r();
    };
    rel = () => {
      rel = null;
      r();
    };
  });
};

const main = async (): Promise<void> => {
  const t0 = await readyTk();
  let auto = !tkExists();
  setSt({ ses: t0 ? "in" : "out", exp: t0?.ex ?? null });
  at = t0?.at ?? "";
  if (t0) void gtMe(t0.at).then((u) => setSt({ usr: u }));
  const clk = mkClk();
  let geo: Geo = { btn: [], bar: { x: 3, y: 23, w: 12 } };
  const go = (): void => {
    const s = gst();
    const w = process.stdout.columns || 80;
    const h = process.stdout.rows || 24;
    const o = bldFr(s, s.ply ? clk.pos(mono()) : 0, w, h);
    geo = o.geo;
    drw(o.rows);
  };
  const sch = mkSch(clk, go);
  sub(() => sch.wake());
  entS();
  entK(kbd(clk), () => geo);
  setScr(false);
  go();

  const ldLy = (p: Ply): void => {
    bldLyr(p)
      .then((l) => {
        setSt({ lyr: l, ldg: false, aux: nAux() });
        warm();
        if (l) say(`Lyric: ${l.src}·${l.wrd ? "word" : "line"}`, 1200);
      })
      .catch((e) => {
        logErr("lyrics", e);
        setSt({ ldg: false });
      });
  };

  const hnd = (o: Pout): void => {
    const s0 = gst();
    if (s0.ses !== "in") return;
    if (o.cd === 204) {
      if (s0.ply) setSt({ ply: null, lyr: null, ldg: false, aux: nAux() });
      return;
    }
    const pl = o.pl;
    if (!pl) return;
    const an = o.ts + (o.te - o.ts) / 2;
    if (!s0.ply || s0.ply.id !== pl.id) {
      const of = gOff(pl.id);
      clk.res(pl.prg, an, pl.ply, of);
      setSt({ ply: pl, lyr: null, ldg: true, off: of });
      ldLy(pl);
      return;
    }
    clk.anc(pl.prg, an);
    if (pl.ply !== s0.ply.ply) clk.setP(pl.ply, mono());
    setSt({ ply: pl });
  };

  const drop = (msg: string): "out" => {
    outSes();
    setSt({
      ses: "out",
      me: false,
      usr: null,
      exp: null,
      lnk: null,
      pst: null,
      ply: null,
      lyr: null,
      ldg: false,
      off: 0,
      aux: nAux(),
      tst: null,
    });
    say(msg);
    return "out";
  };

  let n401 = 0;
  const sess = async (): Promise<"q" | "out"> => {
    while (!qit && gst().ses === "in") {
      try {
        const o = await fchPly(at);
        if (o.cd === 401) {
          if (++n401 > 3) return drop("Session expired");
          try {
            const t = await rfNw();
            at = t.at;
            setSt({ exp: t.ex });
            n401 = 0;
            continue;
          } catch (e) {
            const cd = e instanceof Herr ? e.cd : 0;
            if (cd === 400 || cd === 401) return drop("Session expired");
            throw e;
          }
        }
        n401 = 0;
        if (o.cd === 429) {
          const s = Math.min(BKO_MAX / 1000, Math.max(5, o.rta || 30));
          logWrn("play", `429 — sleeping ${s}s`);
          say(`Rate limit — ${s}s`, s * 1000 + 500);
          await slI(s * 1000);
          continue;
        }
        if (o.cd >= 500) throw new Error(`server error ${o.cd}`);
        hnd(o);
        await slI(cfg.pol);
      } catch (e) {
        logErr("loop", e);
        say("Net error — retrying", ERR_D);
        await slI(ERR_D);
      }
    }
    return qit ? "q" : "out";
  };

  const xit = (): void => {
    qit = true;
    kk();
    sch.stp();
    extK();
    setScr(true);
    extS();
  };

  const beginAuth = async (): Promise<void> => {
    asked = false;
    const f = mkFlow();
    fl = f;
    setSt({ ses: "wait", lnk: f.url, pst: null, me: false, hlp: false, set: false });
    try {
      const t = await f.done;
      at = t.at;
      setSt({ ses: "in", lnk: null, pst: null, exp: t.ex, tst: null });
      say("Signed in");
      void gtMe(t.at).then((u) => setSt({ usr: u }));
    } catch (e) {
      const cd = e instanceof Herr ? e.cd : 0;
      setSt({ ses: "out", lnk: null, pst: null, me: false });
      if (qit) return;
      if (cd === 499) say("Sign-in cancelled");
      else if (cd === 408) say("Sign-in timed out");
      else if (cd === 498) say("Sign-in port busy");
      else {
        logErr("auth", e);
        say("Sign-in failed");
      }
    } finally {
      fl = null;
    }
  };

  process.on("SIGINT", () => {
    xit();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    xit();
    process.exit(0);
  });
  process.on("uncaughtException", (e) => {
    logErr("fatal", e);
    xit();
    process.exit(1);
  });
  process.on("unhandledRejection", (e) => {
    logErr("fatal", e);
    xit();
    process.exit(1);
  });
  process.stdout.on("resize", () => {
    rst();
    go();
  });
  logInf("main", `polling every ${cfg.pol}ms`);

  for (;;) {
    if (qit) break;
    const t = await readyTk();
    if (t) {
      at = t.at;
      setSt({ ses: "in", exp: t.ex, me: false });
      if (!gst().usr) void gtMe(t.at).then((u) => setSt({ usr: u }));
      const why = await sess();
      if (why === "q") break;
      continue;
    }
    setSt({ ses: "out", me: false, usr: null, exp: null, lnk: null, pst: null });
    if (auto) auto = false;
    else {
      await gate();
      if (qit) break;
    }
    await beginAuth();
  }
  xit();
  process.exit(0);
};

const kbd = (clk: Clk): Kbd => {
  const sek = (ms: number): void => {
    const s = gst();
    if (!s.ply) return;
    const v = Math.max(0, Math.min(s.ply.dur, Math.round(ms)));
    clk.res(v, mono(), s.ply.ply, s.off);
    setSt({ ply: { ...s.ply, prg: v } });
    say(`Seek ${fmtT(v)}`);
    sekPly(at, v).catch((e) => logErr("seek", e));
  };
  return {
    q: () => {
      fl?.cancel();
      qit = true;
      kk();
    },
    sp: () => {
      const s = gst();
      if (!s.ply) return;
      const to = !s.ply.ply;
      clk.setP(to, mono());
      setSt({ ply: { ...s.ply, ply: to } });
      say(to ? "Playing" : "Paused");
      plyCmd(at, to).catch((e) => logErr("keys", e));
    },
    nx: () => {
      nxtPly(at)
        .then(kk)
        .catch((e) => logErr("keys", e));
    },
    pv: () => {
      prvPly(at)
        .then(kk)
        .catch((e) => logErr("keys", e));
    },
    ofs: (d: number) => {
      const s = gst();
      if (!s.ply) return;
      const no = s.off + d;
      clk.setO(no);
      setSt({ off: no });
      sOff(s.ply.id, no);
      say(`Offset ${fmtO(no)}`);
    },
    rst: () => {
      const s = gst();
      if (!s.ply) return;
      clk.setO(0);
      setSt({ off: 0 });
      sOff(s.ply.id, 0);
      say("Offset 0ms");
    },
    skd: (d: number) => {
      const s = gst();
      if (!s.ply) return;
      sek(clk.pos(mono()) + d);
    },
    sek: (f: number) => {
      const s = gst();
      if (!s.ply) return;
      sek(f * s.ply.dur);
    },
    hov: (id: string | null) => {
      if (gst().hov !== id) setSt({ hov: id });
    },
    dwn: (id: string) => setSt({ prs: { id, at: mono() } }),
    tab: () => togView(),
    hlp: () => togHlp(),
    rom: () => pressRom(),
    vie: () => pressVie(),
    me: () => togMe(),
    sgn: () => {
      const f = ask;
      ask = null;
      rel = null;
      asked = true;
      f?.();
    },
    pSt: () => setSt({ pst: "" }),
    pIn: (c: string) => {
      const cur = gst().pst ?? "";
      if (c === "\x03") {
        qit = true;
        kk();
        return;
      }
      if (c === "\x1b") {
        setSt({ pst: null });
        return;
      }
      if (c === "\r" || c === "\n") {
        if (!fl?.feed(cur)) say("Not a valid redirect URL");
        return;
      }
      if (c.length === 1) setSt({ pst: cur + c });
    },
    pCn: () => fl?.cancel(),
    out: () => {
      outSes();
      setSt({
        ses: "out",
        me: false,
        hlp: false,
        set: false,
        reb: false,
        sRow: 0,
        sQ: [],
        ply: null,
        lyr: null,
        ldg: false,
        off: 0,
        aux: nAux(),
        usr: null,
        exp: null,
        lnk: null,
        pst: null,
        tst: null,
      });
      say("Signed out");
      kk();
    },
    sCfg: () => togSet(),
    sNav: (d: number) => sMov(d),
    sAdj: (d: number) => sChg(d),
    sEnt: () => sEnt(),
    sCap: (c: string) => sBind(c),
    sInp: (c: string) => sInp(c),
  };
};

main().catch((e) => {
  logErr("main", e);
  setScr(true);
  extS();
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
