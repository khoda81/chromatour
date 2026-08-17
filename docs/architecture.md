# Architecture

Chromatour has three deliberately narrow layers.

## 1. Presentation

Framework-free TypeScript renders the ordered palette to a Canvas and exposes
experiment controls. It owns no optimization logic.

## 2. Solver boundary

`TourSolver` accepts RGB colors plus an objective specification and returns a
permutation and metrics. The UI does not know whether the implementation is:

- Rust/WASM in the browser,
- JavaScript,
- a Web Worker,
- or a remote service.

This is the seam we preserve while experimenting.

## 3. Optimization core

`chromatour-core` converts sRGB to OKLab, constructs perceptual distances,
evaluates the objective, and currently runs a simple baseline optimizer.

The objective is an **open Hamiltonian path**, not a cycle.

## Performance direction

Start synchronous and local. If solver work becomes noticeable, the first
escalation should be moving the same WASM solver behind a Web Worker so the UI
stays responsive. Remote compute should only be introduced after measurements
show a meaningful quality/latency benefit.
