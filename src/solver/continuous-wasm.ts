import type { ObjectiveSpec, Rgb, SearchSnapshot } from "../types";

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

type WorkerMessage = SnapshotMessage | ErrorMessage;

export class ContinuousWasmSolver {
  readonly name = "continuous WASM search";

  private readonly worker = new Worker(new URL("./solver.worker.ts", import.meta.url), {
    type: "module",
  });
  private session = 0;
  private onSnapshot: ((snapshot: SearchSnapshot) => void) | undefined;
  private onError: ((message: string) => void) | undefined;

  constructor() {
    this.worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.session !== this.session) return;

      if (message.type === "snapshot") {
        this.onSnapshot?.(message.snapshot);
      } else {
        this.onError?.(message.message);
      }
    });
  }

  start(
    colors: readonly Rgb[],
    objective: ObjectiveSpec,
    topK: number,
    onSnapshot: (snapshot: SearchSnapshot) => void,
    onError?: (message: string) => void,
  ): void {
    this.session += 1;
    this.onSnapshot = onSnapshot;
    this.onError = onError;

    this.worker.postMessage({
      type: "start",
      session: this.session,
      colors: [...colors],
      objective,
      topK,
    });
  }

  dispose(): void {
    this.worker.terminate();
  }
}
