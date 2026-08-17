import type { ObjectiveSpec, Rgb, SearchSnapshot, TourResult } from "../types";

type WasmModule = typeof import("../wasm/pkg/chromatour_core.js");
type WasmSearch = InstanceType<WasmModule["Search"]>;

interface StartMessage {
  type: "start";
  session: number;
  colors: Rgb[];
  objective: ObjectiveSpec;
  topK: number;
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

interface ErrorMessage {
  type: "error";
  session: number;
  message: string;
}

type OutboundMessage = SnapshotMessage | TelemetryMessage | ErrorMessage;

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
}

const ITERATIONS_SLOT = 0;
const scope = self as unknown as WorkerScope;
let wasmPromise: Promise<WasmModule> | undefined;
let activeSession = 0;
let activeState: RunState | undefined;

async function loadWasm(): Promise<WasmModule> {
  if (!wasmPromise) {
    wasmPromise = import("../wasm/pkg/chromatour_core.js").then(async (module) => {
      await module.default();
      return module;
    });
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

function runChunk(state: RunState): void {
  if (state.session !== activeSession) return;

  const deadline = performance.now() + 8;
  let changed = false;

  do {
    changed = state.search.step(1) || changed;
  } while (performance.now() < deadline);

  state.dirty ||= changed;
  writeTelemetry(state);
  maybePostSnapshot(state);

  // Yield so parameter changes and snapshot acknowledgements are handled promptly.
  scope.setTimeout(() => runChunk(state), 0);
}

scope.onmessage = (event) => {
  const message = event.data;

  if (message.type === "ack") {
    const state = activeState;
    if (!state || state.session !== message.session) return;

    state.snapshotInFlight = false;
    maybePostSnapshot(state);
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
      const search = new wasm.Search(
        flatten(message.colors),
        message.objective.power,
        message.topK,
        random[0],
      );

      const state: RunState = {
        session,
        search,
        colorCount: message.colors.length,
        telemetry: message.telemetry ? new BigUint64Array(message.telemetry) : undefined,
        snapshotInFlight: false,
        dirty: false,
      };
      activeState = state;

      // Produce a useful first elite set without ever blanking the main-thread UI.
      search.step(message.topK * 2);
      state.dirty = true;
      writeTelemetry(state);
      maybePostSnapshot(state);
      scope.setTimeout(() => runChunk(state), 0);
    })
    .catch((error: unknown) => {
      if (session !== activeSession) return;
      scope.postMessage({
        type: "error",
        session,
        message: error instanceof Error ? error.message : "Worker solver failed.",
      });
    });
};
