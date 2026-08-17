# Chromatour

**Chromatour** finds visually satisfying orderings of colors by treating color
sorting as an open traveling-salesperson problem in perceptual color space.

The first objective is deliberately simple and measurable. For an ordering
`c₁ … cₙ`, let `dᵢ` be the Euclidean OKLab distance between adjacent colors:

```text
J_p = Σ dᵢ^p
```

`p = 1` is ordinary total path length. Increasing `p` progressively punishes
large perceptual jumps. The tour is an **open path**: there is no cost between
the last and first colors.

## Stack

- **Browser:** framework-free TypeScript + Canvas
- **Tooling/package manager:** Bun
- **Optimizer core:** Rust compiled to WebAssembly with `wasm-bindgen` / `wasm-pack`
- **Build:** Vite
- **CI:** GitHub Actions

The web layer talks to a small `TourSolver` interface. Today it uses an in-browser
WASM baseline; a stronger WASM solver or remote solver can replace it without
changing the renderer or experiment UI.

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

The first `bun install` creates `bun.lock`, and the first Cargo build creates
`Cargo.lock`; commit both to make dependency resolution reproducible.

Useful commands:

```bash
bun run dev       # debug WASM + Vite dev server
bun run build     # release WASM + typecheck + production web build
bun test          # TypeScript/Bun tests
bun run check     # TypeScript typecheck
cargo test        # Rust tests
cargo clippy --workspace --all-targets -- -D warnings
```

## Current baseline

The included solver is **not intended to be the final TSP solver**. It is a
multi-start greedy path followed by 2-opt. Its purpose is to make the full
browser → WASM → objective → tour → Canvas pipeline real immediately and give
future solvers something to beat.

Metrics currently exposed by the WASM core:

- `cost`: `Σ dᵢ^p`
- `worstEdge`: `max dᵢ`, before applying `p`

## Repository layout

```text
chromatour/
├── crates/chromatour-core/   # OKLab objective + solver code compiled to WASM
├── docs/
│   ├── decisions/            # lightweight architecture decisions
│   └── experiments/          # experiment protocol and results
├── src/
│   ├── solver/               # solver boundary / WASM adapter
│   ├── wasm/                 # generated wasm-pack package (gitignored)
│   └── ...                   # Canvas UI
└── .github/workflows/ci.yml
```

## Experiments

Objective and solver changes should be recorded under [`docs/experiments`](docs/experiments/README.md).
The point is not bureaucracy; it is to avoid losing the reason a weird-looking
scoring term exists six weeks later.

The initial objective experiment is in
[`docs/experiments/0001-objective-power.md`](docs/experiments/0001-objective-power.md).

## Near-term roadmap

1. Establish a small fixed benchmark palette set.
2. Compare `p = 1, 1.5, 2, 3, 4, 8` visually and numerically.
3. Replace the baseline with a proper open-TSP solver and benchmark quality/time.
4. Add image / palette import.
5. Only consider a remote solver if browser-side quality or latency actually hurts.
