import "./style.css";
import { demoColors, shuffled } from "./colors";
import { drawPalette } from "./render";
import { ContinuousWasmSolver } from "./solver";
import { identityOrder } from "./tour";
import type { Rgb, SearchSnapshot, SolverKind, TourResult } from "./types";

const TOP_K = 9;
const MIN_POWER = 0.01;
const MAX_POWER = 1.0;
const PLOT_INTERVAL_MS = 150;

const SOLVER_LABELS: Record<SolverKind, string> = {
  "ils-2opt": "Iterated 2-opt",
  "random-2opt": "Random restart + 2-opt",
  "greedy-2opt": "Greedy starts + 2-opt",
};

interface HistoryPoint {
  seconds: number;
  cost: number;
}

interface SolutionCard {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  cost: HTMLElement;
  worst: HTMLElement;
}

const solutions = document.querySelector<HTMLElement>("#solutions")!;
const power = document.querySelector<HTMLInputElement>("#power")!;
const powerValue = document.querySelector<HTMLOutputElement>("#power-value")!;
const colorCount = document.querySelector<HTMLInputElement>("#color-count")!;
const colorCountValue = document.querySelector<HTMLOutputElement>("#color-count-value")!;
const solverSelect = document.querySelector<HTMLSelectElement>("#solver")!;
const iterations = document.querySelector<HTMLElement>("#iterations")!;
const eliteCount = document.querySelector<HTMLElement>("#elite-count")!;
const status = document.querySelector<HTMLElement>("#status")!;
const historyPlot = document.querySelector<HTMLElement>("#history-plot")!;

const solver = new ContinuousWasmSolver();
const cards: SolutionCard[] = [];
const histories = new Map<SolverKind, HistoryPoint[]>();

let colors: Rgb[] = [];
let latest: SearchSnapshot = { iterations: 0, results: [] };
let pendingSnapshot: SearchSnapshot | undefined;
let previousBestOrder: number[] | undefined;
let currentEliteCount = 0;
let needsSolutionRender = true;
let lastRenderedIterations: bigint | undefined;
let animationFrame = 0;
let runStartedAt = performance.now();
let searchComplete = false;
let historyDirty = false;
let historyRevision = 0;
let plotRendering = false;
let lastPlotRenderAt = 0;

function selectedSolver(): SolverKind {
  return solverSelect.value as SolverKind;
}

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

function objectivePower(): number {
  // The native range lives in t ∈ [0, 1]. Map it logarithmically onto
  // p ∈ [0.01, 1] so the visually interesting sub-1 region gets most of the travel.
  const t = Math.min(1, Math.max(0, Number(power.value)));
  return MIN_POWER * (MAX_POWER / MIN_POWER) ** t;
}

function formatPower(value: number): string {
  return value < 0.1 ? value.toFixed(3) : value.toFixed(2);
}

function canonicalizeOrder(order: readonly number[]): number[] {
  const oriented = [...order];
  if (oriented.length > 1 && oriented[0] > oriented[oriented.length - 1]) {
    oriented.reverse();
  }
  return oriented;
}

function orientLike(order: readonly number[], reference: readonly number[] | undefined): number[] {
  if (!reference || reference.length !== order.length || order.length < 2) {
    return canonicalizeOrder(order);
  }

  const positions = new Int32Array(reference.length);
  reference.forEach((node, index) => {
    positions[node] = index;
  });

  let directDistance = 0;
  let reversedDistance = 0;
  for (let index = 0; index < order.length; index += 1) {
    directDistance += Math.abs(positions[order[index]] - index);
    reversedDistance += Math.abs(positions[order[order.length - 1 - index]] - index);
  }

  if (reversedDistance < directDistance) {
    return [...order].reverse();
  }
  if (directDistance < reversedDistance) {
    return [...order];
  }
  return canonicalizeOrder(order);
}

function orientSnapshot(snapshot: SearchSnapshot, rememberBest: boolean): SearchSnapshot {
  if (snapshot.results.length === 0) return snapshot;

  const bestOrder = orientLike(snapshot.results[0].order, rememberBest ? previousBestOrder : undefined);
  if (rememberBest) {
    previousBestOrder = bestOrder;
  }

  return {
    ...snapshot,
    results: snapshot.results.map((result, rank) => ({
      ...result,
      order: rank === 0 ? bestOrder : orientLike(result.order, bestOrder),
    })),
  };
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

function clearHistories(): void {
  histories.clear();
  historyRevision += 1;
  historyDirty = true;
}

function resetSelectedHistory(): void {
  histories.set(selectedSolver(), []);
  historyDirty = true;
}

function recordHistory(snapshot: SearchSnapshot): void {
  const cost = snapshot.results[0]?.metrics.cost;
  if (cost === undefined || !Number.isFinite(cost) || cost <= 0) return;

  const kind = selectedSolver();
  const points = histories.get(kind) ?? [];
  const seconds = (performance.now() - runStartedAt) / 1000;
  const previous = points.at(-1);

  // Snapshots are emitted whenever the elite set changes, but the best entry
  // may stay unchanged while lower ranks improve. Keep only best-score changes.
  if (previous && cost >= previous.cost) return;

  points.push({ seconds, cost });
  histories.set(kind, points);
  historyDirty = true;
}

async function renderHistory(): Promise<void> {
  const traces = [...histories.entries()]
    .filter(([, points]) => points.length > 0)
    .map(([kind, points]) => ({
      type: "scatter" as const,
      mode: "lines" as const,
      name: SOLVER_LABELS[kind],
      x: points.map((point) => point.seconds),
      y: points.map((point) => point.cost),
      line: { shape: "hv" as const },
      hovertemplate: "%{x:.3f}s<br>%{y:.6g}<extra>%{fullData.name}</extra>",
    }));

  if (traces.length === 0) {
    historyPlot.replaceChildren();
    return;
  }

  const { default: Plotly } = await import("plotly.js-basic-dist-min");
  await Plotly.react(
    historyPlot,
    traces,
    {
      autosize: true,
      margin: { l: 62, r: 18, t: 12, b: 48 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "#bdbdbd", family: "Inter, ui-sans-serif, system-ui, sans-serif" },
      xaxis: {
        title: { text: "Elapsed time (s)" },
        gridcolor: "#2b2b2b",
        zeroline: false,
      },
      yaxis: {
        title: { text: "Best score" },
        type: "log",
        gridcolor: "#2b2b2b",
        zeroline: false,
      },
      legend: { orientation: "h", y: 1.08, x: 0 },
      showlegend: traces.length > 1,
      hovermode: "x unified",
      uirevision: `objective-${historyRevision}`,
    },
    {
      responsive: true,
      displaylogo: false,
      scrollZoom: false,
    },
  );
}

function scheduleHistoryRender(now: number): void {
  if (!historyDirty || plotRendering || now - lastPlotRenderAt < PLOT_INTERVAL_MS) return;

  historyDirty = false;
  plotRendering = true;
  lastPlotRenderAt = now;
  void renderHistory()
    .catch((error: unknown) => {
      console.error("Failed to render solver history", error);
    })
    .finally(() => {
      plotRendering = false;
    });
}

function updateStatus(): void {
  const label = SOLVER_LABELS[selectedSolver()];
  if (searchComplete) {
    status.textContent = `${label} exhausted its finite start set · best result retained.`;
    return;
  }

  status.textContent = solver.usesSharedTelemetry()
    ? `${label} · shared-memory telemetry.`
    : `${label} · message telemetry fallback.`;
}

function restartSearch(preserveCurrentSolutions: boolean): void {
  const count = Number(colorCount.value);
  pendingSnapshot = undefined;
  currentEliteCount = 0;
  needsSolutionRender = true;
  lastRenderedIterations = undefined;
  searchComplete = false;
  runStartedAt = performance.now();

  if (!preserveCurrentSolutions || colors.length !== count) {
    colors = demoColors(count);
    previousBestOrder = undefined;
    latest = orientSnapshot(placeholderSnapshot(count), false);
  }

  const p = objectivePower();
  const kind = selectedSolver();
  powerValue.value = formatPower(p);
  status.textContent = `Starting ${SOLVER_LABELS[kind]} on ${count} colors…`;

  solver.start(
    colors,
    { power: p },
    TOP_K,
    kind,
    (snapshot) => {
      recordHistory(snapshot);
      pendingSnapshot = snapshot;
    },
    (message) => {
      status.textContent = message;
    },
    () => {
      searchComplete = true;
      updateStatus();
    },
  );
}

function frame(now: number): void {
  if (pendingSnapshot) {
    latest = orientSnapshot(pendingSnapshot, true);
    pendingSnapshot = undefined;
    currentEliteCount = latest.results.length;
    needsSolutionRender = true;
    updateStatus();
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

  scheduleHistoryRender(now);
  animationFrame = requestAnimationFrame(frame);
}

power.addEventListener("input", () => {
  powerValue.value = formatPower(objectivePower());
  clearHistories();
  resetSelectedHistory();
  restartSearch(true);
});

colorCount.addEventListener("input", () => {
  colorCountValue.value = colorCount.value;
  clearHistories();
  resetSelectedHistory();
  restartSearch(false);
});

solverSelect.addEventListener("change", () => {
  resetSelectedHistory();
  restartSearch(true);
});

new ResizeObserver(() => {
  needsSolutionRender = true;
}).observe(solutions);

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrame);
  solver.dispose();
});

ensureCards();
powerValue.value = formatPower(objectivePower());
colorCountValue.value = colorCount.value;
resetSelectedHistory();
restartSearch(false);
animationFrame = requestAnimationFrame(frame);
