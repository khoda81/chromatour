import type { ObjectiveSpec, Rgb, SearchSnapshot } from "../types";

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

type WorkerMessage = SnapshotMessage | TelemetryMessage | ErrorMessage;

const ITERATIONS_SLOT = 0;
const TELEMETRY_SLOTS = 1;

function createSharedTelemetry(): BigUint64Array | undefined {
  if (!window.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
    return undefined;
  }

  return new BigUint64Array(
    new SharedArrayBuffer(BigUint64Array.BYTES_PER_ELEMENT * TELEMETRY_SLOTS),
  );
}

export class ContinuousWasmSolver {
  readonly name = "continuous WASM search";

  private worker: Worker;
  private readonly telemetry = createSharedTelemetry();
  private session = 0;
  private fallbackIterations = 0n;
  private onSnapshot: ((snapshot: SearchSnapshot) => void) | undefined;
  private onError: ((message: string) => void) | undefined;

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
    onSnapshot: (snapshot: SearchSnapshot) => void,
    onError?: (message: string) => void,
  ): void {
    this.session += 1;
    this.fallbackIterations = 0n;
    this.onSnapshot = onSnapshot;
    this.onError = onError;

    // A 2-opt attempt cannot be preempted from inside WASM. Replacing the
    // worker makes a new slider value a hard cancellation point instead of
    // letting expensive stale restarts pile up in the old worker's queue.
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
