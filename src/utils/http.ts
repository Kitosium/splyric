import type { Hres } from "../types/typ.ts";

export class Herr extends Error {
  cd: number;
  constructor(cd: number, msg: string) {
    super(msg);
    this.cd = cd;
  }
}

const pth = (u: string): string => u.split("?")[0] ?? u;

export const req = async (u: string, i: RequestInit = {}, tm = 12000): Promise<Hres> => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), tm);
  try {
    const r = await fetch(u, { ...i, signal: ac.signal });
    const bd = await r.text();
    return { cd: r.status, hd: r.headers, bd };
  } finally {
    clearTimeout(t);
  }
};

export const hOk = (r: Hres, u: string): void => {
  if (r.cd >= 400) throw new Herr(r.cd, `http ${r.cd} ${pth(u)}`);
};

export const jreq = async <T>(u: string, i: RequestInit = {}, tm?: number): Promise<T> => {
  const r = await req(u, i, tm);
  hOk(r, u);
  try {
    return JSON.parse(r.bd) as T;
  } catch {
    throw new Herr(r.cd, `invalid json ${pth(u)}`);
  }
};
