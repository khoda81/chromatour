import type { ObjectiveSpec, Rgb, SearchSnapshot, SolverKind } from "../types";

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

type WorkerMessage = SnapshotMessage | TelemetryMessage | CompleteMessage | ErrorMessage;

const ITERATIONS_SLOT = 0;
const TELEMETRY_SLOTS = 1;

const STRATEGY_CODE: Record<SolverKind, number> = {
  "ils-2opt": 0,
  "random-2opt": 1,
  "greedy-2opt": 2,
  "three-opt": 3,
  annealing: 4,
  lk: 5,
  "ant-colony": 6,
};

function createSharedTelemetry(): BigUint64Array | undefined {
  if (!window.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
    return undefined;
  }

  return new BigUint64Array(
    new SharedArrayBuffer(BigUint64Array.BYTES_PER_ELEMENT * TELEMETRY_SLOTS),
  );
}

export class ContinuousWasmSolver {
  readonly name = "WASM search";

  private worker: Worker;
  private readonly telemetry = createSharedTelemetry();
  private session = 0;
  private fallbackIterations = 0n;
  private onSnapshot: ((snapshot: SearchSnapshot) => void) | undefined;
  private onError: ((message: string) => void) | undefined;
  private onComplete: (() => void) | undefined;

  constructor() {
    this.worker = this.createWorker();
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), {
      type: "module",
    });

    worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.session !== this.session) return;

      if (message.type === "snapshot") {
        this.onSnapshot?.(message.snapshot);
      } else if (message.type === "telemetry") {
        this.fallbackIterations = BigInt(Math.floor(message.iterations));
      } else if (message.type === "complete") {
        this.onComplete?.();
      } else {
        this.onError?.(message.message);
      }
    });

    worker.addEventListener("error", (event) => {
      this.onError?.(event.message || "Solver worker crashed.");
    });

    worker.addEventListener("messageerror", () => {
      this.onError?.("Solver worker could not decode a message.");
    });

    return worker;
  }

  start(
    colors: readonly Rgb[],
    objective: ObjectiveSpec,
    topK: number,
    strategy: SolverKind,
    onSnapshot: (snapshot: SearchSnapshot) => void,
    onError?: (message: string) => void,
    onComplete?: () => void,
  ): void {
    this.session += 1;
    this.fallbackIterations = 0n;
    this.onSnapshot = onSnapshot;
    this.onError = onError;
    this.onComplete = onComplete;

    // One local-search attempt is synchronous inside WASM. Replacing the worker
    // makes slider/solver changes hard cancellation points.
    this.worker.terminate();
    this.worker = this.createWorker();

    if (this.telemetry) {
      Atomics.store(this.telemetry, ITERATIONS_SLOT, 0n);
    }

    this.worker.postMessage({
      type: "start",
      session: this.session,
      colors: [...colors],
      objective,
      topK,
      strategy: STRATEGY_CODE[strategy],
      telemetry: this.telemetry?.buffer,
    });
  }

  acknowledgeSnapshot(): void {
    this.worker.postMessage({ type: "ack", session: this.session });
  }

  iterations(): bigint {
    if (this.telemetry) {
      return Atomics.load(this.telemetry, ITERATIONS_SLOT);
    }
    return this.fallbackIterations;
  }

  usesSharedTelemetry(): boolean {
    return this.telemetry !== undefined;
  }

  dispose(): void {
    this.worker.terminate();
  }
}
