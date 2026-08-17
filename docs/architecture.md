# Architecture

Chromatour has four deliberately narrow layers.

## 1. Presentation

Framework-free TypeScript renders ranked palettes to Canvas and exposes experiment controls. It owns no optimization logic. Controls update immediately; solver results arrive asynchronously.

## 2. Solver client

`ContinuousWasmSolver` owns a dedicated Web Worker. Each search request carries a monotonically increasing session id plus the colors, objective, and requested `topK`. Old snapshots are ignored after a newer request starts, so rapid slider changes need no special cancellation protocol.

The main thread never performs optimization work.

## 3. Worker

The worker loads the WASM module once and owns the long-lived Rust `Search` object. Search runs in short synchronous chunks, then yields with `setTimeout(..., 0)` so the worker can process updated parameters promptly.

Snapshots are throttled independently from search: elite changes can be published quickly, while iteration counts still update occasionally after the elite set stabilizes.

## 4. Optimization core

`chromatour-core` converts sRGB to OKLab, constructs the perceptual distance matrix, evaluates the objective, and maintains a top-k elite set.

The first `n` attempts use the original multi-start greedy + 2-opt baseline. After that, search continues indefinitely with random and elite-perturbed candidates followed by 2-opt.

The objective is currently an **open Hamiltonian path**, not a cycle.

## Remote solver seam

A remote solver remains an optional future backend. The UI should continue to consume asynchronous ranked snapshots rather than depending on WASM-specific behavior, so moving search off-device does not require rewriting presentation code.
