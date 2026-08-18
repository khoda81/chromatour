import type { Rgb } from "./types";

let queuedPalette: Rgb[] | undefined;

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

function parseHexToken(token: string): Rgb {
  const match = token.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    throw new Error(`Invalid color “${token}”. Use #RGB or #RRGGBB.`);
  }

  const hex =
    match[1].length === 3
      ? [...match[1]].map((digit) => digit + digit).join("")
      : match[1];

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

/** Parse comma, whitespace, or semicolon separated CSS-style hex colors. */
export function parseHexColors(input: string): Rgb[] {
  const tokens = input.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) {
    throw new Error("Paste at least one hex color.");
  }
  return tokens.map(parseHexToken);
}

/** Queue a custom palette for the next `demoColors` call with the same size. */
export function queueImportedPalette(colors: readonly Rgb[]): void {
  queuedPalette = colors.map((color) => ({ ...color }));
}

function takeQueuedPalette(count: number): Rgb[] | undefined {
  if (!queuedPalette || queuedPalette.length !== count) return undefined;
  const palette = queuedPalette;
  queuedPalette = undefined;
  return palette;
}

/** A deterministic, deliberately messy palette for the first render. */
export function demoColors(count = 48): Rgb[] {
  const imported = takeQueuedPalette(count);
  if (imported) return imported;

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
