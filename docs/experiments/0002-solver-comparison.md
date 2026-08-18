# EXP 0002: Which search strategy converges best?

## Goal

Separate the contribution of initialization, local search, and elite
perturbation before adding more sophisticated TSP machinery.

## Initial solvers

1. **Iterated 2-opt** — greedy starts first, then mostly perturb an elite tour,
   with occasional random restarts, followed by 2-opt to a local optimum.
2. **Random restart + 2-opt** — independent random permutations followed by
   2-opt. This isolates how much the elite/perturbation loop helps.
3. **Greedy starts + 2-opt** — enumerate every nearest-neighbor start exactly
   once and stop. This is a finite baseline for the current palette.

All three share the same OKLab distance matrix, objective, 2-opt implementation,
and top-k elite bookkeeping.

## Comparison protocol

- Keep palette, color count, and objective power fixed.
- Run one solver at a time so CPU scheduling does not contaminate wall-clock
  comparisons.
- Keep previous convergence traces when switching solver.
- Plot best score against elapsed wall time on a logarithmic score axis.
- Clear traces when the objective or palette cardinality changes.

## Next candidates

Depending on the curves, likely follow-ups are candidate-list / don't-look
2-opt, 3-opt, Lin-Kernighan-style search, and an exact branch-and-bound mode for
small palettes. Only an exact solver may report a proven `OPTIMAL` state.
