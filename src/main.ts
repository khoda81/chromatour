import "./style.css";
import { demoColors } from "./colors";
import { drawPalette } from "./render";
import { ContinuousWasmSolver } from "./solver";
import type { Rgb, SearchSnapshot, TourResult } from "./types";

const TOP_K = 8;

const solutions = document.querySelector<HTMLElement>("#solutions")!;
const power = document.querySelector<HTMLInputElement>("#power")!;
const powerValue = document.querySelector<HTMLOutputElement>("#power-value")!;
const colorCount = document.querySelector<HTMLInputElement>("#color-count")!;
const colorCountValue = document.querySelector<HTMLOutputElement>("#color-count-value")!;
const iterations = document.querySelector<HTMLElement>("#iterations")!;
const eliteCount = document.querySelector<HTMLElement>("#elite-count")!;
const status = document.querySelector<HTMLElement>("#status")!;

interface SolutionCard {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  cost: HTMLElement;
  worst: HTMLElement;
}

const solver = new ContinuousWasmSolver();
const cards: SolutionCard[] = [];
let colors: Rgb[] = [];
let latest: SearchSnapshot = { iterations: 0, results: [] };

function createCard(rank: number): SolutionCard {
  const root = document.createElement("article");
  root.className = "solution";
  root.hidden = true;

  const header = document.createElement("div");
  header.className = "solution-header";

  const title = document.createElement("h2");
  title.textContent = `#${rank + 1}`;

  const metrics = document.createElement("div");
  metrics.className = "solution-metrics";

  const cost = document.createElement("span");
  const worst = document.createElement("span");
  metrics.append(cost, worst);
  header.append(title, metrics);

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", `Color ordering ranked ${rank + 1}`);

  root.append(header, canvas);
  solutions.append(root);

  return { root, canvas, cost, worst };
}

function ensureCards(): void {
  while (cards.length < TOP_K) {
    cards.push(createCard(cards.length));
  }
}

function renderResult(card: SolutionCard, result: TourResult | undefined): void {
  card.root.hidden = !result;
  if (!result) return;

  card.cost.textContent = `cost ${result.metrics.cost.toPrecision(6)}`;
  card.worst.textContent = `worst ${result.metrics.worstEdge.toPrecision(5)}`;
  drawPalette(card.canvas, colors, result.order);
}

function render(): void {
  cards.forEach((card, rank) => renderResult(card, latest.results[rank]));
  iterations.textContent = Math.floor(latest.iterations).toLocaleString();
  eliteCount.textContent = `${latest.results.length}/${TOP_K}`;
}

function restartSearch(): void {
  const count = Number(colorCount.value);
  colors = demoColors(count);
  latest = { iterations: 0, results: [] };
  render();

  status.textContent = `Starting ${solver.name} for ${count} colors…`;
  solver.start(
    colors,
    { power: Number(power.value) },
    TOP_K,
    (snapshot) => {
      latest = snapshot;
      status.textContent = "Searching continuously in a Web Worker.";
      render();
    },
    (message) => {
      status.textContent = message;
    },
  );
}

power.addEventListener("input", () => {
  powerValue.value = Number(power.value).toFixed(2);
  restartSearch();
});

colorCount.addEventListener("input", () => {
  colorCountValue.value = colorCount.value;
  restartSearch();
});

new ResizeObserver(render).observe(solutions);
window.addEventListener("beforeunload", () => solver.dispose());

ensureCards();
powerValue.value = Number(power.value).toFixed(2);
colorCountValue.value = colorCount.value;
restartSearch();
