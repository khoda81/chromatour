import type { ObjectiveSpec, Rgb, SearchSnapshot, TourResult } from "../types";

type WasmModule = typeof import("../wasm/pkg/chromatour_core.js");
interface WasmSearch {
  step(attempts: number): boolean;
  elite_count(): number;
  orders(): Uint32Array;
  costs(): Float64Array;
  worst_edges(): Float64Array;
  iterations(): number;
  finished(): boolean;
}

interface StartMessage {
  type: "start";
  session: number;
  colors: Rgb[];
  objective: ObjectiveSpec;
  topK: number;
  strategy: number;
  telemetry?: SharedArrayBuffer;
}

interface AckMessage {
  type: "ack";
  session: number;
}

type InboundMessage = StartMessage | AckMessage;

interface SnapshotMessage {
  type: "snapshot";
  session: number;
  snapshot: SearchSnapshot;
}

interface TelemetryMessage {
  type: "telemetry";
  session: number;
  iterations: number;
}

interface CompleteMessage {
  type: "complete";
  session: number;
}

interface ErrorMessage {
  type: "error";
  session: number;
  message: string;
}

type OutboundMessage =
  SnapshotMessage | TelemetryMessage | CompleteMessage | ErrorMessage;

interface WorkerScope {
  onmessage: ((event: MessageEvent<InboundMessage>) => void) | null;
  postMessage(message: OutboundMessage): void;
  setTimeout(handler: () => void, timeout?: number): number;
}

interface RunState {
  session: number;
  search: WasmSearch;
  colorCount: number;
  telemetry?: BigUint64Array;
  snapshotInFlight: boolean;
  dirty: boolean;
  finished: boolean;
}

const ITERATIONS_SLOT = 0;
const scope = self as unknown as WorkerScope;
let wasmPromise: Promise<WasmModule> | undefined;
let activeSession = 0;
let activeState: RunState | undefined;

async function loadWasm(): Promise<WasmModule> {
  if (!wasmPromise) {
    wasmPromise = import("../wasm/pkg/chromatour_core.js").then(
      async (module) => {
        await module.default();
        return module;
      },
    );
  }
  return wasmPromise;
}

function flatten(colors: readonly Rgb[]): Uint8Array {
  const rgb = new Uint8Array(colors.length * 3);
  colors.forEach((color, index) => {
    rgb[index * 3] = color.r;
    rgb[index * 3 + 1] = color.g;
    rgb[index * 3 + 2] = color.b;
  });
  return rgb;
}

function snapshot(state: RunState): SearchSnapshot {
  const eliteCount = state.search.elite_count();
  const orders = Array.from(state.search.orders());
  const costs = Array.from(state.search.costs());
  const worstEdges = Array.from(state.search.worst_edges());
  const results: TourResult[] = [];

  for (let rank = 0; rank < eliteCount; rank += 1) {
    const start = rank * state.colorCount;
    results.push({
      order: orders.slice(start, start + state.colorCount),
      metrics: {
        cost: costs[rank],
        worstEdge: worstEdges[rank],
      },
    });
  }

  return {
    iterations: state.search.iterations(),
    results,
  };
}

function writeTelemetry(state: RunState): void {
  const iterations = Math.floor(state.search.iterations());
  if (state.telemetry) {
    Atomics.store(state.telemetry, ITERATIONS_SLOT, BigInt(iterations));
  } else {
    scope.postMessage({
      type: "telemetry",
      session: state.session,
      iterations,
    });
  }
}

function maybePostSnapshot(state: RunState): void {
  if (!state.dirty || state.snapshotInFlight) return;

  scope.postMessage({
    type: "snapshot",
    session: state.session,
    snapshot: snapshot(state),
  });
  state.dirty = false;
  state.snapshotInFlight = true;
}

function maybeComplete(state: RunState): void {
  if (!state.finished || state.snapshotInFlight || state.dirty) return;
  if (state.session !== activeSession) return;

  scope.postMessage({ type: "complete", session: state.session });
  activeState = undefined;
}

function reportFailure(state: RunState, error: unknown): void {
  if (state.session !== activeSession) return;

  scope.postMessage({
    type: "error",
    session: state.session,
    message: error instanceof Error ? error.message : "Solver worker failed.",
  });
  activeState = undefined;
}

function runChunk(state: RunState): void {
  if (state.session !== activeSession) return;

  const deadline = performance.now() + 8;
  let changed = false;

  try {
    do {
      changed = state.search.step(1) || changed;
      if (state.search.finished()) {
        state.finished = true;
        break;
      }
    } while (performance.now() < deadline);
  } catch (error: unknown) {
    reportFailure(state, error);
    return;
  }

  state.dirty ||= changed;
  writeTelemetry(state);
  maybePostSnapshot(state);

  if (state.finished) {
    maybeComplete(state);
    return;
  }

  scope.setTimeout(() => runChunk(state), 0);
}

scope.onmessage = (event) => {
  const message = event.data;

  if (message.type === "ack") {
    const state = activeState;
    if (!state || state.session !== message.session) return;

    state.snapshotInFlight = false;
    maybePostSnapshot(state);
    maybeComplete(state);
    return;
  }

  activeSession = message.session;
  activeState = undefined;
  const session = message.session;

  void loadWasm()
    .then((wasm) => {
      if (session !== activeSession) return;

      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      const SearchClass =
        message.strategy >= 5 ? wasm.AdvancedSearch : wasm.Search;
      const search: WasmSearch = new SearchClass(
        flatten(message.colors),
        message.objective.power,
        message.topK,
        random[0],
        message.strategy,
      );

      const state: RunState = {
        session,
        search,
        colorCount: message.colors.length,
        telemetry: message.telemetry
          ? new BigUint64Array(message.telemetry)
          : undefined,
        snapshotInFlight: false,
        dirty: false,
        finished: false,
      };
      activeState = state;

      writeTelemetry(state);
      scope.setTimeout(() => runChunk(state), 0);
    })
    .catch((error: unknown) => {
      if (session !== activeSession) return;
      scope.postMessage({
        type: "error",
        session,
        message:
          error instanceof Error ? error.message : "Worker solver failed.",
      });
    });
};
