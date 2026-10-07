import { randomUUID } from "node:crypto";
import { COLY, CTOK, GTSP, UAWB } from "../config/const.ts";
import { cfg } from "../config/env.ts";
import { logErr } from "../errors/log.ts";
import { jreq, req } from "../utils/http.ts";
import { bldL } from "./lrc.ts";
import type { Lne, Lyr, Ply } from "../types/typ.ts";

type Gst = {
  accessToken?: string;
  clientId?: string;
  accessTokenExpirationTimestampMs?: number;
};
type Ctk = { granted_token?: { token?: string; expires_after_seconds?: number } };
type Cly = {
  lyrics?: {
    lines?: { startTimeMs?: string; words?: string }[];
  };
};

let atk: { v: string; ex: number; cid: string } | null = null;
let ctk: { v: string; ex: number } | null = null;
const did = randomUUID();

const gtAt = async (): Promise<string | null> => {
  if (atk && atk.ex > Date.now() + 30000) return atk.v;
  try {
    const d = await jreq<Gst>(GTSP, {
      headers: {
        Cookie: `sp_dc=${cfg.dck}`,
        Referer: "https://open.spotify.com/",
        "User-Agent": UAWB,
      },
    });
    if (!d.accessToken) return null;
    atk = {
      v: d.accessToken,
      ex: d.accessTokenExpirationTimestampMs ?? Date.now() + 1800000,
      cid: d.clientId ?? cfg.cid,
    };
    return atk.v;
  } catch (e) {
    logErr("spot", e);
    return null;
  }
};

const gtCt = async (): Promise<string | null> => {
  if (ctk && ctk.ex > Date.now() + 30000) return ctk.v;
  try {
    const d = await jreq<Ctk>(CTOK, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Origin: "https://open.spotify.com",
        Referer: "https://open.spotify.com/",
        "User-Agent": UAWB,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_data: {
          client_version: "1.2.91.72.g5337566e",
          client_id: atk?.cid ?? cfg.cid,
          js_sdk_data: {
            device_brand: "unknown",
            device_model: "unknown",
            os: "linux",
            os_version: "6.0",
            device_id: did,
            device_type: "computer",
          },
        },
      }),
    });
    const v = d.granted_token?.token;
    if (!v) return null;
    ctk = { v, ex: Date.now() + (d.granted_token?.expires_after_seconds ?? 1800) * 1000 };
    return ctk.v;
  } catch (e) {
    logErr("spot", e);
    return null;
  }
};

export const fchSpot = async (p: Ply): Promise<Lyr | null> => {
  if (!cfg.dck) return null;
  const a = await gtAt();
  if (!a) return null;
  const c = await gtCt();
  if (!c) return null;
  const r = await req(`${COLY}/${p.id}?format=json&market=from_token`, {
    headers: {
      Authorization: `Bearer ${a}`,
      "Client-Token": c,
      "App-platform": "WebPlayer",
      Origin: "https://open.spotify.com",
      Referer: "https://open.spotify.com/",
      "User-Agent": UAWB,
    },
  });
  if (r.cd >= 400) return null;
  let d: Cly | null;
  try {
    d = JSON.parse(r.bd) as Cly;
  } catch (e) {
    logErr("spot", e);
    return null;
  }
  const ln: Lne[] = (d?.lyrics?.lines ?? [])
    .map((l) => ({
      t: Number(l.startTimeMs ?? 0),
      s: (l.words ?? "").trim(),
      w: [],
    }))
    .filter((l) => l.s && Number.isFinite(l.t));
  if (!ln.length) return null;
  return bldL(ln, "spot", false);
};
