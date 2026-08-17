import "./style.css";
import { demoColors, shuffled } from "./colors";
import { drawPalette } from "./render";
import { ContinuousWasmSolver } from "./solver";
import { identityOrder } from "./tour";
import type { Rgb, SearchSnapshot, TourResult } from "./types";

const TOP_K = 9;

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
let pendingSnapshot: SearchSnapshot | undefined;
let currentEliteCount = 0;
let needsSolutionRender = true;
let lastRenderedIterations: bigint | undefined;
let animationFrame = 0;

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

function metric(label: string, value: number, precision: number): string {
  return Number.isFinite(value) ? `${label} ${value.toPrecision(precision)}` : `${label} —`;
}

function renderResult(card: SolutionCard, result: TourResult | undefined): void {
  card.root.hidden = !result;
  if (!result) return;

  card.cost.textContent = metric("cost", result.metrics.cost, 6);
  card.worst.textContent = metric("worst", result.metrics.worstEdge, 5);
  drawPalette(card.canvas, colors, result.order);
}

function renderSolutions(): void {
  cards.forEach((card, rank) => renderResult(card, latest.results[rank]));
  eliteCount.textContent = `${currentEliteCount}/${TOP_K}`;
  needsSolutionRender = false;
}

function placeholderSnapshot(count: number): SearchSnapshot {
  const identity = identityOrder(count);
  return {
    iterations: 0,
    results: Array.from({ length: TOP_K }, () => ({
      order: shuffled(identity),
      metrics: { cost: Number.NaN, worstEdge: Number.NaN },
    })),
  };
}

function restartSearch(preserveCurrentSolutions: boolean): void {
  const count = Number(colorCount.value);
  pendingSnapshot = undefined;
  currentEliteCount = 0;
  needsSolutionRender = true;
  lastRenderedIterations = undefined;

  if (!preserveCurrentSolutions || colors.length !== count) {
    colors = demoColors(count);
    latest = placeholderSnapshot(count);
  }

  status.textContent = `Searching ${count} colors with ${solver.name}…`;
  solver.start(
    colors,
    { power: Number(power.value) },
    TOP_K,
    (snapshot) => {
      // The worker allows only one unacknowledged solution snapshot at a time,
      // so this is a single-slot mailbox rather than an ever-growing queue.
      pendingSnapshot = snapshot;
    },
    (message) => {
      status.textContent = message;
    },
  );
}

function frame(): void {
  if (pendingSnapshot) {
    latest = pendingSnapshot;
    pendingSnapshot = undefined;
    currentEliteCount = latest.results.length;
    needsSolutionRender = true;
    status.textContent = solver.usesSharedTelemetry()
      ? "Searching continuously · shared-memory telemetry."
      : "Searching continuously · message telemetry fallback.";

    // Tell the worker this snapshot made it to the display clock. If it found
    // more improvements meanwhile, it can now send exactly the newest state.
    solver.acknowledgeSnapshot();
  }

  if (needsSolutionRender) {
    renderSolutions();
  }

  const currentIterations = solver.iterations();
  if (currentIterations !== lastRenderedIterations) {
    iterations.textContent = currentIterations.toLocaleString();
    lastRenderedIterations = currentIterations;
  }

  animationFrame = requestAnimationFrame(frame);
}

power.addEventListener("input", () => {
  powerValue.value = Number(power.value).toFixed(2);
  // The old tours are still valid permutations, so keep them visible while the
  // new objective catches up instead of flashing an empty/random state.
  restartSearch(true);
});

colorCount.addEventListener("input", () => {
  colorCountValue.value = colorCount.value;
  // Different cardinality invalidates the old permutations. Show random valid
  // tours immediately and let the worker replace them asynchronously.
  restartSearch(false);
});

new ResizeObserver(() => {
  needsSolutionRender = true;
}).observe(solutions);

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrame);
  solver.dispose();
});

ensureCards();
powerValue.value = Number(power.value).toFixed(2);
colorCountValue.value = colorCount.value;
restartSearch(false);
animationFrame = requestAnimationFrame(frame);
