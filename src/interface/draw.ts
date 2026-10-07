import { cut } from "./anim.ts";

let last: string[] = [];
let on = false;

export const entS = (): void => {
  process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[2J\x1b[?1003h\x1b[?1006h");
  on = true;
  last = [];
};

export const extS = (): void => {
  if (!on) return;
  process.stdout.write("\x1b[?1003l\x1b[?1006l\x1b[?25h\x1b[?1049l");
  on = false;
  last = [];
};

export const rst = (): void => {
  last = [];
  if (on) process.stdout.write("\x1b[2J");
};

export const diff = (fr: string[], prev: string[], w: number, h: number): [string, string[]] => {
  const n = Math.min(fr.length, h);
  const rows = Array.from({ length: n }, (_, i) => cut(fr[i] ?? "", w));
  const cl: string[] = [];
  const m = Math.min(Math.max(n, prev.length), h);
  for (let i = 0; i < m; i++) {
    const ln = rows[i] ?? "";
    if (prev[i] !== ln) cl.push(`\x1b[${i + 1};1H\x1b[2K${ln}`);
  }
  return [cl.join(""), rows];
};

export const drw = (fr: string[]): void => {
  const w = process.stdout.columns || 80;
  const h = process.stdout.rows || 24;
  const [o, rows] = diff(fr, last, w, h);
  if (o) process.stdout.write(o);
  last = rows;
};
