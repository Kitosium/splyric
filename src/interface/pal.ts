import type { RGB } from "./anim.ts";

export let ACC: RGB = [110, 235, 255];

export const setAcc = (c: RGB): void => {
  ACC = c;
};
