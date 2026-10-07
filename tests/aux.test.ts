import { BASE, gj } from "./helpers.ts";
import { strict as A } from "node:assert";
import { after, beforeEach, describe, test } from "node:test";
import type { TestContext } from "node:test";
import type { Aux } from "../src/types/typ.ts";

let hnd: (u: string) => Response = () => new Response("{}", { status: 404 });
globalThis.fetch = (async (u: unknown) => hnd(String(u))) as typeof fetch;

const { detLy, isVie, kanaRom, jaRom, zhPin, loadRom, loadVie, pressRom, pressVie, warm } =
  await import("../src/lyrics/aux.ts");
const { setSt, gst, nAux } = await import("../src/core/state.ts");
const { S } = await import("../src/core/set.ts");
const { pseLrc, bldL } = await import("../src/lyrics/lrc.ts");
const { cfg } = await import("../src/config/env.ts");

const baseAI = { u: cfg.aiu, k: cfg.aik, m: cfg.aim, sk: S.aik };
cfg.aiu = "";
cfg.aik = "";
cfg.aim = "";
S.aik = "";

after(() => {
  cfg.aiu = baseAI.u;
  cfg.aik = baseAI.k;
  cfg.aim = baseAI.m;
  S.aik = baseAI.sk;
});

const ly = (t: string) => bldL(pseLrc(t), "t", false);

const setSong = (text: string, aux: Partial<Aux> = {}): void =>
  setSt({ ...BASE, lyr: ly(text), aux: { ...nAux(), ...aux } });

const useAI = (t: TestContext): void => {
  const keep = { u: cfg.aiu, k: cfg.aik, m: cfg.aim };
  t.after(() => {
    cfg.aiu = keep.u;
    cfg.aik = keep.k;
    cfg.aim = keep.m;
  });
  cfg.aiu = "http://ai.test/v1";
  cfg.aik = "k";
  cfg.aim = "m";
};

const useLang = (t: TestContext, lang: string): void => {
  const keep = S.lang;
  t.after(() => {
    S.lang = keep;
  });
  S.lang = lang;
};

const googleTo =
  (answer: (q: string) => string) =>
  (u: string): Response => {
    if (u.includes("translate.googleapis.com")) {
      const q = decodeURIComponent(u.split("q=")[1]!);
      return gj([[[answer(q)]]]);
    }
    return new Response("{}", { status: 404 });
  };

beforeEach(() => {
  hnd = () => new Response("{}", { status: 404 });
});

describe("language detection", () => {
  test("detLy picks the script of the whole song", () => {
    A.equal(detLy(["それは美しい"]), "ja", "a kana line reads as japanese");
    A.equal(detLy(["我爱你"]), "zh-Hans", "a hanzi line reads as simplified chinese");
    A.equal(detLy(["hello world"]), null, "latin lines need no script");
  });

  test("detLy lets kana win over hanzi", () => {
    A.equal(detLy(["日本語が好き"]), "ja", "kana wins over hanzi");
  });

  test("isVie spots vietnamese letters", () => {
    A.ok(isVie(["bạn bè"]), "vietnamese-only letters count");
    A.ok(isVie(["Tôi yêu em"]), "circumflex vowels count");
    A.ok(!isVie(["hello world", "the sky is blue today"]), "other languages translate as usual");
  });
});

describe("romanization helpers", () => {
  test("kanaRom converts kana words", () => {
    A.equal(kanaRom("ありがとう"), "arigatou", "hiragana becomes romaji");
    A.equal(kanaRom("こんにちは"), "konnichiha", "long vowels keep their mora");
  });

  test("kanaRom handles small kana and gemination", () => {
    A.equal(kanaRom("キャ"), "kya", "small ya joins the previous mora");
    A.equal(kanaRom("マッチ"), "macchi", "a sokuon doubles the consonant");
    A.equal(kanaRom("スター"), "sutaa", "a prolonged sound mark repeats the vowel");
  });

  test("kanaRom passes text without kana through", () => {
    A.equal(kanaRom("AIYOU"), "AIYOU", "letters that are not kana stay untouched");
  });

  test("zhPin romanizes hanzi to pinyin", () => {
    A.deepEqual(zhPin(["我爱你"]), ["wo ai ni"], "hanzi becomes pinyin");
    A.deepEqual(zhPin(["AIYOU 爱你"]), ["AIYOU ai ni"], "latin runs stay as they are");
  });

  test("jaRom tokenizes Japanese with the offline dictionary", async () => {
    const r = await jaRom(["それは美しい歌です 天文学的方程を解きたいんだ"]);
    A.equal(
      r[0],
      "sore wa utsukushii uta desu tenmongakutekikatahodo wo toki tai n da",
      "grammar words and particles come out in romaji",
    );
    const r2 = await jaRom(["君のことが好きだよ どんな時も"]);
    A.equal(r2[0], "kimi no koto ga suki da yo donna toki mo", "tokenized per line");
  });
});

describe("translation", () => {
  test("google translates every line of the song", async () => {
    hnd = googleTo((q) => (q === "hello" ? "xin chào" : "thế giới"));
    setSong("[00:01.00]hello\n[00:05.00]world", { vie: true });
    await loadVie();
    A.deepEqual(gst().aux.vl, ["xin chào", "thế giới"], "every line comes back translated");
    A.equal(gst().aux.vie, true, "stays on after loading");
  });

  test("a blocked google is probed once and edge answers in one batch", async () => {
    let g = 0;
    let e = 0;
    hnd = (u) => {
      if (u.includes("translate.googleapis.com")) {
        g++;
        return new Response("sorry", { status: 404 });
      }
      if (u.includes("edge.microsoft.com")) {
        e++;
        return gj([
          { translations: [{ text: "bản dịch" }] },
          { translations: [{ text: "bản dịch" }] },
        ]);
      }
      return new Response("{}", { status: 404 });
    };
    setSong("[00:01.00]hello\n[00:05.00]world");
    await loadVie();
    A.deepEqual(gst().aux.vl, ["bản dịch", "bản dịch"], "one edge batch answers every line");
    A.equal(g, 1, "google is probed once, not per line");
    A.equal(e, 1, "edge answers in a single request");
  });

  test("mymemory answers when google and edge are down", async () => {
    hnd = (u) => {
      if (u.includes("translate.googleapis.com")) return new Response("sorry", { status: 404 });
      if (u.includes("mymemory")) return gj({ responseData: { translatedText: "bản dịch" } });
      return new Response("{}", { status: 404 });
    };
    setSong("[00:01.00]hello\n[00:05.00]world");
    await loadVie();
    A.deepEqual(gst().aux.vl, ["bản dịch", "bản dịch"], "every line comes back from mymemory");
  });

  test("a configured ai translates the whole song in one call", async (t) => {
    useAI(t);
    let h = 0;
    hnd = (u) => {
      if (u.includes("ai.test")) {
        h++;
        return gj({ choices: [{ message: { content: '["xin chào","thế giới"]' } }] });
      }
      return new Response("no", { status: 500 });
    };
    setSong("[00:01.00]hello\n[00:05.00]world");
    await loadVie();
    A.deepEqual(gst().aux.vl, ["xin chào", "thế giới"], "the ai answers every line");
    A.equal(h, 1, "one request for the whole song");
  });

  test("an ai answer of the wrong length falls back to google", async (t) => {
    useAI(t);
    let h = 0;
    hnd = (u) => {
      if (u.includes("ai.test")) {
        h++;
        return gj({ choices: [{ message: { content: '["một"]' } }] });
      }
      return googleTo((q) => (q === "hello" ? "dịch google" : "google hai"))(u);
    };
    setSong("[00:01.00]hello\n[00:05.00]world");
    await loadVie();
    A.deepEqual(
      gst().aux.vl,
      ["dịch google", "google hai"],
      "a length mismatch falls back to google",
    );
  });

  test("a key saved in settings runs the ai without any env", async (t) => {
    const keep = S.aik;
    t.after(() => {
      S.aik = keep;
    });
    S.aik = "AIzaSyTESTKEY12345";
    const urls: string[] = [];
    hnd = (u) => {
      urls.push(u);
      if (u.includes("generativelanguage.googleapis.com")) {
        return gj({ choices: [{ message: { content: '["xin chào","thế giới"]' } }] });
      }
      return new Response("{}", { status: 404 });
    };
    setSong("[00:01.00]hello\n[00:05.00]world");
    await loadVie();
    A.deepEqual(gst().aux.vl, ["xin chào", "thế giới"], "the whole song comes back translated");
    A.ok(
      urls[0]!.includes("generativelanguage.googleapis.com/v1beta/openai/chat/completions"),
      "gemini is the default endpoint",
    );
    A.ok(!urls.some((u) => u.includes("translate.googleapis.com")), "no fallback runs");
  });

  test("loadVie fails open when every service fails", async () => {
    hnd = () => new Response("nope", { status: 500 });
    setSong("[00:01.00]hello", { vie: true });
    await loadVie();
    A.equal(gst().aux.vl, null, "no partial state");
    A.equal(gst().aux.vie, false, "toggles back off");
    A.equal(gst().tst?.s, "No translation", "English message");
  });

  test("vietnamese lyrics skip every translator", async (t) => {
    useLang(t, "vi");
    let n = 0;
    hnd = () => {
      n++;
      return new Response("no", { status: 500 });
    };
    setSong("[00:01.00]Hôm nay trời đẹp\n[00:05.00]Đừng bỏ rơi tôi", { vie: true });
    await loadVie();
    A.equal(n, 0, "no translator is called at all");
    A.equal(gst().aux.vl, null, "nothing cached");
    A.equal(gst().aux.vie, false, "toggles back off");
    A.equal(gst().tst?.s, "Already Vietnamese", "English message");
  });

  test("translation targets the configured language", async (t) => {
    useLang(t, "en");
    const urls: string[] = [];
    hnd = (u) => {
      urls.push(u);
      return googleTo((q) => (q === "hello" ? "hi there" : "whole world"))(u);
    };
    setSong("[00:01.00]hello\n[00:05.00]world");
    await loadVie();
    A.deepEqual(gst().aux.vl, ["hi there", "whole world"], "every line comes back translated");
    A.ok(urls[0]!.includes("tl=en"), "google translates into english");
    A.ok(
      !urls.some((u) => u.includes("edge.microsoft.com")),
      "the google probe answers the whole song",
    );
  });

  test("a japanese song skips when japanese is the target", async (t) => {
    useLang(t, "ja");
    let n = 0;
    hnd = () => {
      n++;
      return new Response("no", { status: 500 });
    };
    setSong("[00:01.00]それは美しい歌\n[00:05.00]君の声が聞こえる", { vie: true });
    await loadVie();
    A.equal(n, 0, "no translator is called at all");
    A.equal(gst().tst?.s, "Already Japanese", "the message names the target");
  });
});

describe("romanization view", () => {
  test("loadRom turns a japanese song into romaji", async () => {
    setSong("[00:01.00]それは美しい歌", { rom: true });
    warm();
    await loadRom();
    A.equal(gst().aux.det, "ja", "the script is detected as japanese");
    A.equal(gst().aux.rl?.[0], "sore wa utsukushii uta", "the line comes out romanized");
    A.equal(gst().aux.rom, true, "romanization stays on");
  });

  test("loadRom turns a chinese song into pinyin", async () => {
    setSong("[00:01.00]我爱你", { rom: true });
    await loadRom();
    A.equal(gst().aux.det, "zh-Hans", "the script is detected as chinese");
    A.deepEqual(gst().aux.rl, ["wo ai ni"], "the line comes out as pinyin");
  });

  test("loadRom explains when there is nothing to romanize", async () => {
    setSong("[00:01.00]hello world", { rom: true });
    await loadRom();
    A.equal(gst().aux.rom, false, "turns back off");
    A.equal(gst().aux.rl, null, "no romanization is produced");
    A.equal(gst().tst?.s, "No romaji or pinyin", "English message");
  });

  test("the s key toggles romanization from the cached rows", () => {
    setSong("[00:01.00]hello", { rl: ["he"] });
    A.equal(gst().aux.rom, false, "romanization starts hidden");
    pressRom();
    A.equal(gst().aux.rom, true, "s shows romanization");
    pressRom();
    A.equal(gst().aux.rom, false, "s hides it again");
  });

  test("the t key toggles the translation from the cached rows", () => {
    setSong("[00:01.00]hello", { vl: ["xin chào"] });
    pressVie();
    A.equal(gst().aux.vie, true, "t shows the translation");
    pressVie();
    A.equal(gst().aux.vie, false, "t hides it again");
  });
});
