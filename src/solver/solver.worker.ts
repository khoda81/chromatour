import type { ObjectiveSpec, Rgb, SearchSnapshot, TourResult } from "../types";

type WasmModule = typeof import("../wasm/pkg/chromatour_core.js");
type WasmSearch = InstanceType<WasmModule["Search"]>;

interface StartMessage {
  type: "start";
  session: number;
  colors: Rgb[];
  objective: ObjectiveSpec;
  topK: number;
}

interface SnapshotMessage {
  type: "snapshot";
  session: number;
  snapshot: SearchSnapshot;
}

interface ErrorMessage {
  type: "error";
  session: number;
  message: string;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<StartMessage>) => void) | null;
  postMessage(message: SnapshotMessage | ErrorMessage): void;
  setTimeout(handler: () => void, timeout?: number): number;
}

interface RunState {
  session: number;
  search: WasmSearch;
  colorCount: number;
  lastPost: number;
}

const scope = self as unknown as WorkerScope;
let wasmPromise: Promise<WasmModule> | undefined;
let activeSession = 0;

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

function postSnapshot(state: RunState): void {
  scope.postMessage({
    type: "snapshot",
    session: state.session,
    snapshot: snapshot(state),
  });
  state.lastPost = performance.now();
}

function runChunk(state: RunState): void {
  if (state.session !== activeSession) return;

  const deadline = performance.now() + 12;
  let changed = false;

  do {
    changed = state.search.step(4) || changed;
  } while (performance.now() < deadline);

  const now = performance.now();
  if ((changed && now - state.lastPost >= 80) || now - state.lastPost >= 250) {
    postSnapshot(state);
  }

  // Yield to the worker event loop so new slider values can cancel this search.
  scope.setTimeout(() => runChunk(state), 0);
}

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type !== "start") return;

  activeSession = message.session;
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
        lastPost: 0,
      };

      // Seed the first visible elite set before publishing the first snapshot.
      search.step(Math.min(message.colors.length, message.topK * 2));
      postSnapshot(state);
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
