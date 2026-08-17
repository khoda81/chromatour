# Experiments

Use one Markdown file per question. Keep it short enough that we actually use it.

Suggested shape:

```text
# EXP NNNN: Question

## Hypothesis
## Setup
## Metrics
## Results
## Visual judgement
## Decision
```

For objective experiments, preserve both the scalar score and the raw adjacent
OKLab distances. A scalar can hide *why* one tour looks better.

When possible, test on the same saved palettes and record:

- color count,
- solver + solver settings,
- objective parameters,
- total objective cost,
- worst adjacent distance,
- median / percentile adjacent distances,
- runtime,
- a screenshot or exported ordering,
- subjective preference.
