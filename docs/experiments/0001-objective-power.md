# EXP 0001: How strongly should large perceptual jumps be penalized?

## Hypothesis

Plain path length (`p = 1`) under-penalizes an isolated ugly jump. Raising
adjacent OKLab distance to a power greater than one should produce smoother,
more satisfying sequences.

## Objective

For adjacent OKLab distances `d₁ … dₙ₋₁`:

```text
J_p = Σ dᵢ^p
```

The sequence is open; the first and last colors are not neighbors.

## Initial sweep

Compare:

```text
p ∈ {1, 1.5, 2, 3, 4, 8}
```

Start with `p = 2` as the working default.

## Metrics

Record at least:

- `J_p`
- maximum raw `dᵢ`
- distribution of raw `dᵢ`
- runtime
- subjective ranking of the rendered tours

## Important caveat

`d^p` primarily punishes large jumps. It does **not** separately model an extra
reward for near-perfect matches. If the visual results show that such matches
matter beyond what the power objective captures, test that as a separate term
rather than baking it in prematurely.

## Decision

Pending visual experiments.
