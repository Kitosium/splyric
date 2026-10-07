import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pinyin } from "pinyin-pro";
import { cfg } from "../config/env.ts";
import { S, langName } from "../core/set.ts";
import { gst, say, setAux } from "../core/state.ts";
import { logErr } from "../errors/log.ts";
import type { Lyr } from "../types/typ.ts";
import { Herr, jreq } from "../utils/http.ts";

const GTX = "https://translate.googleapis.com/translate_a/single";
const MMY = "https://api.mymemory.translated.net/get";
const AIGU = "https://generativelanguage.googleapis.com/v1beta/openai";
const AIMM = "gemini-flash-lite-latest";
const EDG = "https://edge.microsoft.com/translate/translatetext";
const KRE = /[\u3040-\u30ff]/;
const HRE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK = /[\u3400-\u9fff]/;
const KAN = /[\u3040-\u30ff]/;
const PNC = /[。、！？，,.!?]/;

const req = createRequire(import.meta.url);

type KTok = {
  tokenize(s: string): { surface_form: string; reading?: string }[];
};
type KBld = { build(cb: (e: Error | null, t: KTok) => void): void };
type KImp = { builder(o: { dicPath: string }): KBld };

const KJ = (x: string): boolean => CJK.test(x) && !KAN.test(x);

const KN: Record<string, string> = {
  あ: "a",
  い: "i",
  う: "u",
  え: "e",
  お: "o",
  か: "ka",
  き: "ki",
  く: "ku",
  け: "ke",
  こ: "ko",
  が: "ga",
  ぎ: "gi",
  ぐ: "gu",
  げ: "ge",
  ご: "go",
  さ: "sa",
  し: "shi",
  す: "su",
  せ: "se",
  そ: "so",
  ざ: "za",
  じ: "ji",
  ず: "zu",
  ぜ: "ze",
  ぞ: "zo",
  た: "ta",
  ち: "chi",
  つ: "tsu",
  て: "te",
  と: "to",
  だ: "da",
  ぢ: "ji",
  づ: "zu",
  で: "de",
  ど: "do",
  な: "na",
  に: "ni",
  ぬ: "nu",
  ね: "ne",
  の: "no",
  は: "ha",
  ひ: "hi",
  ふ: "fu",
  へ: "he",
  ほ: "ho",
  ば: "ba",
  び: "bi",
  ぶ: "bu",
  べ: "be",
  ぼ: "bo",
  ぱ: "pa",
  ぴ: "pi",
  ぷ: "pu",
  ぺ: "pe",
  ぽ: "po",
  ま: "ma",
  み: "mi",
  む: "mu",
  め: "me",
  も: "mo",
  や: "ya",
  ゆ: "yu",
  よ: "yo",
  ら: "ra",
  り: "ri",
  る: "ru",
  れ: "re",
  ろ: "ro",
  わ: "wa",
  ゐ: "wi",
  ゑ: "we",
  を: "wo",
  ん: "n",
  ゔ: "vu",
  ぁ: "a",
  ぃ: "i",
  ぅ: "u",
  ぇ: "e",
  ぉ: "o",
  ゃ: "ya",
  ゅ: "yu",
  ょ: "yo",
  ゎ: "wa",
};

const DIG: Record<string, string> = {
  てぃ: "ti",
  でぃ: "di",
  とぅ: "tu",
  どぅ: "du",
  ふぁ: "fa",
  ふぃ: "fi",
  ふぇ: "fe",
  ふぉ: "fo",
  しぇ: "she",
  ちぇ: "che",
  じぇ: "je",
  うぃ: "wi",
  うぇ: "we",
  うぉ: "wo",
  すぃ: "si",
  ずぃ: "zi",
};

const PRT: Record<string, string> = { は: "wa", へ: "e" };

export const kanaRom = (s: string): string => {
  let out = "";
  let dbl = false;
  const push = (r: string): void => {
    if (dbl) {
      dbl = false;
      if (r && !"aeiou".includes(r[0]!)) r = r[0]! + r;
    }
    out += r;
  };
  let h = "";
  for (const ch of s) {
    const n = ch.charCodeAt(0);
    h += n >= 0x30a1 && n <= 0x30f6 ? String.fromCharCode(n - 0x60) : ch;
  }
  let j = 0;
  while (j < h.length) {
    const two = h.slice(j, j + 2);
    if (DIG[two]) {
      push(DIG[two]!);
      j += 2;
      continue;
    }
    const ch = h[j]!;
    if (ch === "っ") {
      dbl = true;
      j++;
      continue;
    }
    if (ch === "ー") {
      const m = /[aeiou]$/.exec(out);
      if (m) out += m[0];
      j++;
      continue;
    }
    if ((ch === "ゃ" || ch === "ゅ" || ch === "ょ") && out.endsWith("i")) {
      const y = ch === "ゃ" ? "a" : ch === "ゅ" ? "u" : "o";
      dbl = false;
      out = `${out.slice(0, -1)}y${y}`;
      j++;
      continue;
    }
    const nx = h[j + 1] ?? "x";
    if (ch === "ゔ" && "ぁぃぅぇぉ".includes(nx)) {
      push(["va", "vi", "vu", "ve", "vo"]["ぁぃぅぇぉ".indexOf(nx)]!);
      j += 2;
      continue;
    }
    push(KN[ch] ?? ch);
    j++;
  }
  return out;
};

let tkP: Promise<KTok> | null = null;
let tkOk = false;

const tok = (): Promise<KTok> =>
  (tkP ??= new Promise<KTok>((res, rej) => {
    const ku = req("kuromoji") as KImp;
    const dic = join(dirname(req.resolve("kuromoji/package.json")), "dict");
    ku.builder({ dicPath: dic }).build((e, t) => (e ? rej(e) : res(t)));
  })
    .catch((e: unknown) => {
      tkP = null;
      throw e;
    })
    .then((t) => {
      tkOk = true;
      return t;
    }));

export const warm = (): void => {
  const l = gst().lyr;
  if (!l) return;
  if (detLy(l.ln.map((x) => x.s)) === "ja") void tok().catch(() => undefined);
};

export const detLy = (ls: string[]): string | null => {
  const all = ls.join("");
  if (KRE.test(all)) return "ja";
  if (HRE.test(all)) return "zh-Hans";
  return null;
};

const VRE =
  /[\u1ea0-\u1ef9\u0110\u0111\u01a0\u01b0\u0102\u0103\u00c2\u00e2\u00ca\u00ea\u00d4\u00f4]/;

export const isVie = (ls: string[]): boolean => VRE.test(ls.join(""));

export const srcIs = (ls: string[], lang: string): boolean => {
  if (lang === "vi") return isVie(ls);
  const d = detLy(ls);
  if (lang === "ja") return d === "ja";
  if (lang === "zh") return d === "zh-Hans";
  return false;
};

export const jaRom = async (lines: string[]): Promise<(string | null)[]> => {
  const t = await tok();
  return lines.map((ln) => {
    let prev = "";
    let out = "";
    for (const x of t.tokenize(ln)) {
      const sf = x.surface_form;
      if (!sf.trim()) {
        if (out && !out.endsWith(" ")) out += " ";
        continue;
      }
      const rd = x.reading && x.reading !== "*" && x.reading.length ? x.reading : sf;
      const ro = sf.length === 1 && PRT[sf] ? PRT[sf]! : kanaRom(rd);
      if (!ro) continue;
      if (out && !/\s$/.test(out) && !(KJ(prev) && KJ(sf))) out += " ";
      out += ro;
      prev = sf;
    }
    const fin = out
      .replace(/\s+([。、！？，,.!?])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    return fin || null;
  });
};

export const zhPin = (lines: string[]): (string | null)[] =>
  lines.map((ln) => {
    const p = pinyin(ln, { type: "string", toneType: "none", nonZh: "consecutive" })
      .replace(/\s+/g, " ")
      .trim();
    return p || null;
  });

const gTr = async (q: string): Promise<string> => {
  const j = await jreq<unknown>(
    `${GTX}?client=gtx&sl=auto&tl=${S.lang}&dt=t&q=${encodeURIComponent(q)}`,
    {},
    9000,
  );
  if (!Array.isArray(j) || !Array.isArray(j[0])) throw new Herr(500, "gtx shape");
  const seg = j[0] as unknown[][];
  const txt = seg.map((x) => (Array.isArray(x) ? String(x[0] ?? "") : "")).join("");
  if (!txt) throw new Herr(500, "gtx empty");
  return txt;
};

const mMTr = async (q: string, det: string | null): Promise<string> => {
  const src = det ? (det.startsWith("zh") ? "zh" : det.slice(0, 2)) : "en";
  const u = `${MMY}?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(src)}|${S.lang}`;
  const j = await jreq<{ responseData?: { translatedText?: string }; quotaFinished?: boolean }>(
    u,
    {},
    9000,
  );
  const t = j.responseData?.translatedText ?? "";
  if (
    !t ||
    j.quotaFinished === true ||
    /^(MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID|NO LANGUAGE PAIR|DEPENDENCY ERROR)/i.test(t)
  ) {
    throw new Herr(500, "mymemory");
  }
  return t;
};

const eTr = async (ls: string[], det: string | null): Promise<string[]> => {
  const from = det ? `&from=${encodeURIComponent(det)}` : "";
  const j = await jreq<{ translations?: { text?: string }[] }[]>(
    `${EDG}?to=${S.lang === "zh" ? "zh-Hans" : S.lang}${from}&isEnterpriseClient=false`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ls),
    },
    15000,
  );
  if (!Array.isArray(j) || j.length !== ls.length) throw new Herr(500, "edge shape");
  return j.map((e) => {
    const t = e?.translations?.[0]?.text ?? "";
    if (!t) throw new Herr(500, "edge empty");
    return t;
  });
};

const jArr = (s: string): string[] | null => {
  const b = s
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const a = JSON.parse(b) as unknown;
    if (Array.isArray(a) && a.every((x) => typeof x === "string")) return a as string[];
  } catch {
    return null;
  }
  return null;
};

const aiCfg = (): { u: string; m: string; k: string } => {
  const k = S.aik || cfg.aik;
  const u = cfg.aiu || (k ? AIGU : "");
  const m = cfg.aim || (k ? AIMM : "");
  return { u, m, k };
};

const aiTr = async (lines: string[], det: string | null): Promise<string[] | null> => {
  const ac = aiCfg();
  if (!ac.u || !ac.m) return null;
  const p = gst().ply;
  const nm = langName(S.lang);
  try {
    const j = await jreq<{ choices?: { message?: { content?: string } }[] }>(
      `${ac.u.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ac.k ? { Authorization: `Bearer ${ac.k}` } : {}),
        },
        body: JSON.stringify({
          model: ac.m,
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content:
                `Translate song lyrics into natural, singable ${nm}. ` +
                `Reply with ONLY a JSON array of strings: one ${nm} translation per input line, same order and same length. ` +
                "Keep empty strings as empty strings. No markdown fences, no commentary.",
            },
            {
              role: "user",
              content:
                `song: ${p ? `${p.ar} — ${p.nm}` : "unknown"}\n` +
                `source language: ${det ?? "auto"}\n` +
                JSON.stringify(lines),
            },
          ],
        }),
      },
      45000,
    );
    const c = j.choices?.[0]?.message?.content ?? "";
    const a = jArr(c);
    if (!a || a.length !== lines.length) throw new Herr(500, "ai shape");
    return a;
  } catch (e) {
    logErr("ai", e);
    return null;
  }
};

const pool = async (
  l: Lyr,
  lines: string[],
  idx: number[],
  f: (q: string, det: string | null) => Promise<string | null>,
  det: string | null,
  out: (string | null)[],
): Promise<number> => {
  let i = 0;
  let ok = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const k = i++;
      if (k >= idx.length) return;
      const p = idx[k]!;
      const t = await f(lines[p]!, det);
      if (t) {
        ok++;
        out[p] = t;
        if (gst().lyr === l) setAux({ vl: [...out] });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, idx.length) }, () => worker()));
  return ok;
};

const mmVie = async (q: string, det: string | null): Promise<string | null> => {
  try {
    return await mMTr(q, det);
  } catch (e) {
    logErr("vie", e);
    return null;
  }
};

const oneVie = async (q: string, det: string | null): Promise<string | null> => {
  try {
    return await gTr(q);
  } catch {
    try {
      return await mMTr(q, det);
    } catch (e) {
      logErr("vie", e);
      return null;
    }
  }
};

let bR = false;
let bV = false;

export const loadRom = async (): Promise<void> => {
  if (bR) return;
  const l = gst().lyr;
  if (!l) {
    setAux({ rom: false });
    return;
  }
  bR = true;
  try {
    const lines = l.ln.map((x) => x.s);
    const det = gst().aux.det ?? detLy(lines);
    if (!det) {
      setAux({ rom: false });
      say("No romaji or pinyin");
      return;
    }
    if (det === "ja" && !tkOk) say("Loading romaji...", 2000);
    const out = det === "ja" ? await jaRom(lines) : zhPin(lines);
    if (gst().lyr !== l) return;
    setAux({ det, rl: out });
  } catch (e) {
    logErr("rom", e);
    if (gst().lyr === l) setAux({ rom: false });
    say("No romanization");
  } finally {
    bR = false;
  }
};

export const loadVie = async (): Promise<void> => {
  if (bV) return;
  const l = gst().lyr;
  if (!l) {
    setAux({ vie: false });
    return;
  }
  bV = true;
  try {
    const lines = l.ln.map((x) => x.s);
    if (srcIs(lines, S.lang)) {
      setAux({ vie: false });
      say(`Already ${langName(S.lang)}`);
      return;
    }
    const det = gst().aux.det ?? detLy(lines);
    const out: (string | null)[] = lines.map(() => null);
    setAux({ det, vl: out });
    const hasAi = Boolean(aiCfg().u && aiCfg().m);
    say("Translating...", hasAi ? 8000 : 2000);
    const tl = await aiTr(lines, det);
    if (gst().lyr !== l) return;
    if (tl) {
      setAux({ vl: tl });
      return;
    }
    const nz: number[] = [];
    for (let i = 0; i < lines.length; i++) if ((lines[i] ?? "").trim()) nz.push(i);
    let ok = 0;
    let gok = false;
    const first = nz[0];
    if (first !== undefined) {
      try {
        out[first] = await gTr(lines[first]!);
        gok = true;
        ok = 1;
        if (gst().lyr === l) setAux({ vl: [...out] });
      } catch {
        gok = false;
      }
    }
    if (gok) {
      ok += await pool(l, lines, nz.slice(1), oneVie, det, out);
    } else if (first !== undefined) {
      try {
        const tr = await eTr(
          nz.map((i) => lines[i]!),
          det,
        );
        for (let k = 0; k < nz.length; k++) {
          out[nz[k]!] = tr[k]!;
          ok++;
        }
        if (gst().lyr === l) setAux({ vl: [...out] });
      } catch (e) {
        logErr("vie", e);
        ok += await pool(l, lines, nz, mmVie, det, out);
      }
    }
    if (gst().lyr !== l) return;
    if (!ok) {
      setAux({ vl: null, vie: false });
      say("No translation");
    }
  } catch (e) {
    logErr("vie", e);
    setAux({ vl: null, vie: false });
    say("No translation");
  } finally {
    bV = false;
  }
};

export const pressRom = (): void => {
  const a = gst().aux;
  if (a.rl) {
    setAux({ rom: !a.rom });
    return;
  }
  if (a.rom) {
    setAux({ rom: false });
    return;
  }
  setAux({ rom: true });
  void loadRom();
};

export const pressVie = (): void => {
  const a = gst().aux;
  if (a.vl) {
    setAux({ vie: !a.vie });
    return;
  }
  if (a.vie) {
    setAux({ vie: false });
    return;
  }
  setAux({ vie: true });
  void loadVie();
};
