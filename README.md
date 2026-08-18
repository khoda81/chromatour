# Chromatour

**Chromatour** finds visually satisfying orderings of colors by treating color sorting as an open traveling-salesperson problem in perceptual color space.

The first objective is deliberately simple and measurable. For an ordering `c₁ … cₙ`, let `dᵢ` be the Euclidean OKLab distance between adjacent colors:

```text
J_p = Σ dᵢ^p
```

`p = 1` is ordinary total path length. Increasing `p` progressively punishes large perceptual jumps. The tour is an **open path**: there is no cost between the last and first colors.

## Stack

- **Browser:** framework-free TypeScript + Canvas
- **Tooling/package manager:** Bun
- **Optimizer core:** Rust compiled to WebAssembly with `wasm-bindgen` / `wasm-pack`
- **Concurrency:** dedicated Web Worker
- **Build:** Vite
- **CI:** GitHub Actions

The WASM search lives entirely inside the worker, so optimization can continuously consume CPU without blocking rendering or slider interaction. The UI receives asynchronous snapshots of the current top-k solutions.

Changing objective power or color count starts a new worker search immediately. Search requests are sessioned, so stale results from superseded slider values are ignored.

## Getting started

Prerequisites:

- Bun
- a current Rust toolchain
- `wasm-pack` (`cargo install wasm-pack --locked`)

Then:

```bash
bun install
bun run dev
```

Useful commands:

```bash
bun run dev       # debug WASM + Vite dev server
bun run build     # release WASM + typecheck + production web build
bun test          # TypeScript/Bun tests
bun run check     # TypeScript typecheck
cargo test        # Rust tests
cargo clippy --workspace --all-targets -- -D warnings
```

## Current search

`chromatour-core::Search` is an anytime baseline rather than a final TSP solver. It maintains a ranked elite set of distinct paths:

1. run greedy + 2-opt from every start node;
2. continue indefinitely with random paths and perturbations of elite paths;
3. apply 2-opt to each candidate;
4. retain the best `k` distinct paths found so far.

The browser currently displays the best eight solutions. Search keeps running after the elite set fills.

Metrics:

- `cost`: `Σ dᵢ^p`
- `worstEdge`: `max dᵢ`, before applying `p`
- search attempts, so continuous progress remains visible even when the top-k does not change

## Repository layout

```text
chromatour/
├── crates/chromatour-core/   # OKLab objective + anytime search compiled to WASM
├── docs/
│   ├── decisions/            # lightweight architecture decisions
│   └── experiments/          # experiment protocol and results
├── src/
│   ├── solver/               # worker client + worker + solver adapters
│   ├── wasm/                 # generated wasm-pack package (gitignored)
│   └── ...                   # Canvas UI
└── .github/workflows/ci.yml
```

## Experiments

Objective and solver changes should be recorded under [`docs/experiments`](docs/experiments/README.md). The point is not bureaucracy; it is to avoid losing the reason a weird-looking scoring term exists six weeks later.

The initial objective experiment is in [`docs/experiments/0001-objective-power.md`](docs/experiments/0001-objective-power.md).

## Near-term roadmap

1. Establish a small fixed benchmark palette set.
2. Compare `p = 1, 1.5, 2, 3, 4, 8` visually and numerically.
3. Replace the anytime baseline with stronger TSP search and benchmark quality/time.
4. Add interactive color editing: pick, add, remove, and eventually drag/reorder.
5. Only consider a remote solver if browser-side quality or throughput actually hurts.
