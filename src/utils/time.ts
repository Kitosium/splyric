export const mono = (): number => performance.now();

export const slp = (ms: number): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

export const fmtT = (ms: number): string => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export const fmtO = (ms: number): string => `${ms >= 0 ? "+" : ""}${ms}ms`;

export const mkDef = <T>(): { p: Promise<T>; s: (v: T) => void } => {
  let s!: (v: T) => void;
  const p = new Promise<T>((r) => {
    s = r;
  });
  return { p, s };
};
