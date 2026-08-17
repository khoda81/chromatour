# EXP 0001: What objective power looks best?

## Objective

For adjacent OKLab distances `d₁ … dₙ₋₁`:

```text
J_p = Σ dᵢ^p
```

The sequence is open; the first and last colors are not neighbors.

The UI reports the optimization-equivalent `L_p` quasi-norm rather than the raw
sum so the score remains numerically stable across extreme powers. For fixed
`p > 0`, this monotone transform does not change which tour wins.

## Initial hypothesis

The first guess was `p > 1`: punish isolated large jumps superlinearly and
encourage globally even transitions.

## Visual result

The opposite regime looked substantially better for the current palette.
Around `p = 0.05`, the concave transform makes extremely close neighbors much
more valuable. The solver forms locally coherent gradients and is willing to
pay for a smaller number of larger seams between them.

That behavior matches the visual target better than globally equalizing every
adjacent gap.

## Working decision

Use a logarithmic UI slider over:

```text
0.01 ≤ p ≤ 1
```

with `p = 0.05` as the default.

The lower bound is numerical rather than aesthetic. With at most 256 colors,
`p = 0.01` keeps the displayed quasi-norm comfortably within `f64` range while
still making the transform extremely concave.

## Metrics

Record at least:

- optimization-equivalent score
- maximum raw adjacent distance
- convergence over elapsed time
- subjective ranking of the rendered tours

## Status

Working default chosen from visual inspection; continue revisiting as editable
palettes and additional solvers land.
