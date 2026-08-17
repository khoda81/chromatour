import type { Rgb } from "./types";

export function drawPalette(
  canvas: HTMLCanvasElement,
  colors: readonly Rgb[],
  order: readonly number[],
): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context is unavailable");

  context.clearRect(0, 0, width, height);
  if (order.length === 0) return;

  for (let position = 0; position < order.length; position += 1) {
    const color = colors[order[position]];
    const x0 = Math.round((position / order.length) * width);
    const x1 = Math.round(((position + 1) / order.length) * width);
    context.fillStyle = `rgb(${color.r} ${color.g} ${color.b})`;
    context.fillRect(x0, 0, x1 - x0, height);
  }
}
