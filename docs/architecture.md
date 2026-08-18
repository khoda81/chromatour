# Architecture

Chromatour has three deliberately narrow layers.

## 1. Presentation

Framework-free TypeScript renders the ordered palettes to Canvas and exposes
experiment controls. It owns no optimization logic.

Rendering follows the display clock. Worker messages only replace a pending
snapshot; `requestAnimationFrame` consumes the newest pending snapshot and draws
at most once per frame. Slider changes never blank the UI: objective changes
keep the previous valid tours visible, while color-count changes immediately
show random valid permutations until optimized results arrive.

## 2. Worker / solver boundary

`ContinuousWasmSolver` owns a dedicated Web Worker. The worker owns the long-lived
Rust/WASM `Search` object and continuously spends one core on optimization.

Solution updates use a one-in-flight mailbox:

1. the worker sends a snapshot only when the visible top-k elite set changes;
2. while that snapshot is unacknowledged, newer improvements only mark the
   worker state dirty;
3. after the main thread consumes the snapshot on an animation frame, it ACKs;
4. if the worker became dirty meanwhile, it immediately sends only the newest
   snapshot.

This bounds queued solution work and avoids arbitrary visual polling delays.

Fast-changing telemetry such as the search-attempt counter uses a
`SharedArrayBuffer` when the page is cross-origin isolated. The main thread reads
that counter directly with `Atomics` on every animation frame. On hosts where
shared memory is unavailable, the worker falls back to lightweight telemetry
messages after each short search chunk.

## 3. Optimization core

`chromatour-core` converts sRGB to OKLab, constructs the perceptual distance
matrix once per search, evaluates the objective, and runs persistent local
search. It maintains the best distinct tours seen so far.

The objective is currently an **open Hamiltonian path**, not a cycle.

The search starts from nearest-neighbor greedy tours and improves each with
2-opt. After the deterministic starts it runs indefinitely, alternating between
random permutations and perturbed elite tours followed by another 2-opt local
search.

## Performance direction

Keep optimization local and asynchronous by default. If one worker/core becomes
the limiting factor, benchmark stronger local-search methods or a worker pool
before introducing remote compute. Shared-memory solver state is intentionally
not required; only tiny telemetry uses shared memory today.
