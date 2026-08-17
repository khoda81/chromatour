# ADR 0001: Browser + WASM + Canvas

## Status

Accepted for the initial implementation.

## Context

Chromatour should be trivial to try: no installation, no server requirement,
and no upload of a user's colors just to sort them. Optimization may become
compute-heavy enough that keeping the hot path out of the UI language is useful.

## Decision

Use:

- Bun for package management and scripts,
- Vite for the browser development/build loop,
- framework-free TypeScript for UI glue,
- Canvas for the palette renderer,
- Rust/WASM for perceptual metrics and optimization.

Keep optimization behind a `TourSolver` interface.

## Consequences

- The first version can be hosted as static files.
- Solver experiments can reuse native Rust tooling and benchmarks later.
- WASM startup/build complexity exists, but is isolated.
- A remote solver remains possible without redesigning the UI contract.
