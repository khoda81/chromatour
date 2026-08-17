# Contributing

Keep changes small and measurable.

Before opening a PR:

```bash
bun test
bun run build
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

For changes to scoring or solver behavior, add or update an experiment note in
`docs/experiments/` with the question, setup, metrics, and what actually looked
better.
