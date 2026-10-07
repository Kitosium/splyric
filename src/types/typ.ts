export type Cfg = {
  cid: string;
  cs: string;
  prt: number;
  pol: number;
  src: string[];
  sty: string;
  dck: string;
  dtr: string;
  amb: number;
  aiu: string;
  aik: string;
  aim: string;
};

export type Tok = { at: string; rt: string; ex: number };

export type Ply = {
  id: string;
  nm: string;
  ar: string;
  alb: string;
  dur: number;
  prg: number;
  ply: boolean;
};

export type Wrd = { t: number; s: string };

export type Lne = { t: number; s: string; w: Wrd[] };

export type Lyr = { ln: Lne[]; src: string; wrd: boolean };

export type Tst = { s: string; at: number; d: number };

export type View = "lyric" | "word";

export type Ses = "in" | "out" | "wait";

export type Aux = {
  rom: boolean;
  vie: boolean;
  det: string | null;
  rl: (string | null)[] | null;
  vl: (string | null)[] | null;
};

export type St = {
  ply: Ply | null;
  lyr: Lyr | null;
  ldg: boolean;
  off: number;
  tst: Tst | null;
  hov: string | null;
  prs: { id: string; at: number } | null;
  view: View;
  hlp: boolean;
  set: boolean;
  reb: boolean;
  sRow: number;
  sQ: string[];
  inp: string | null;
  aux: Aux;
  ses: Ses;
  me: boolean;
  lnk: string | null;
  pst: string | null;
  usr: string | null;
  exp: number | null;
};

export type Sets = {
  keys: Record<string, string>;
  lang: string;
  acc: string;
  osk: number;
  skp: number;
  aik: string;
};

export type SRow =
  { k: "key"; a: string[] } | { k: "lang" | "aik" | "pal" | "osk" | "skp"; lab: string };

export type Clk = {
  anc: (p: number, t: number) => void;
  pos: (t: number) => number;
  setP: (b: boolean, t: number) => void;
  setO: (o: number) => void;
  getO: () => number;
  res: (p: number, t: number, b: boolean, o: number) => void;
  rat: () => number;
};

export type Sch = { wake: () => void; stp: () => void };

export type Hres = { cd: number; hd: Headers; bd: string };
