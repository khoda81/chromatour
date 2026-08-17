import "./style.css";
import { demoColors, shuffled } from "./colors";
import { drawPalette } from "./render";
import { WasmBaselineSolver } from "./solver";
import { identityOrder } from "./tour";
import type { Rgb } from "./types";

const canvas = document.querySelector<HTMLCanvasElement>("#palette")!;
const power = document.querySelector<HTMLInputElement>("#power")!;
const powerValue = document.querySelector<HTMLOutputElement>("#power-value")!;
const solveButton = document.querySelector<HTMLButtonElement>("#solve")!;
const randomizeButton = document.querySelector<HTMLButtonElement>("#randomize")!;
const cost = document.querySelector<HTMLElement>("#cost")!;
const worst = document.querySelector<HTMLElement>("#worst")!;
const count = document.querySelector<HTMLElement>("#count")!;
const status = document.querySelector<HTMLElement>("#status")!;

const solver = new WasmBaselineSolver();
let colors: Rgb[] = shuffled(demoColors());
let order = identityOrder(colors.length);

function render(): void {
  drawPalette(canvas, colors, order);
  count.textContent = String(colors.length);
}

function clearMetrics(): void {
  cost.textContent = "—";
  worst.textContent = "—";
}

power.addEventListener("input", () => {
  powerValue.value = Number(power.value).toFixed(2);
  clearMetrics();
  status.textContent = "Objective changed; solve again to compare.";
});

randomizeButton.addEventListener("click", () => {
  colors = shuffled(colors);
  order = identityOrder(colors.length);
  clearMetrics();
  status.textContent = "Shuffled.";
  render();
});

solveButton.addEventListener("click", async () => {
  solveButton.disabled = true;
  randomizeButton.disabled = true;
  status.textContent = `Solving with ${solver.name}…`;

  try {
    const result = await solver.solve(colors, { power: Number(power.value) });
    order = result.order;
    cost.textContent = result.metrics.cost.toPrecision(6);
    worst.textContent = result.metrics.worstEdge.toPrecision(5);
    status.textContent = "Solved locally in WebAssembly.";
    render();
  } catch (error) {
    console.error(error);
    status.textContent = error instanceof Error ? error.message : "Solver failed.";
  } finally {
    solveButton.disabled = false;
    randomizeButton.disabled = false;
  }
});

new ResizeObserver(render).observe(canvas);
powerValue.value = Number(power.value).toFixed(2);
render();
