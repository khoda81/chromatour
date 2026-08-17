import type { Rgb } from "./types";

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  let r = 0;
  let g = 0;
  let b = 0;

  if (hp < 1) [r, g] = [c, x];
  else if (hp < 2) [r, g] = [x, c];
  else if (hp < 3) [g, b] = [c, x];
  else if (hp < 4) [g, b] = [x, c];
  else if (hp < 5) [r, b] = [x, c];
  else [r, b] = [c, x];

  const m = l - c / 2;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** A deterministic, deliberately messy palette for the first render. */
export function demoColors(count = 48): Rgb[] {
  const goldenAngle = 137.507764;
  return Array.from({ length: count }, (_, index) => {
    const hue = (index * goldenAngle + 17) % 360;
    const saturation = 0.52 + ((index * 29) % 31) / 100;
    const lightness = 0.33 + ((index * 17) % 38) / 100;
    return hslToRgb(hue, Math.min(saturation, 0.88), Math.min(lightness, 0.72));
  });
}

export function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const j = random[0] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
