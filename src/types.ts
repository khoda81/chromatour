export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface ObjectiveSpec {
  /** Sum of adjacent OKLab distances raised to this power. */
  power: number;
}

export interface TourMetrics {
  cost: number;
  /** Maximum raw adjacent OKLab distance, before the objective transform. */
  worstEdge: number;
}

export interface TourResult {
  order: number[];
  metrics: TourMetrics;
}

export interface SearchSnapshot {
  iterations: number;
  results: TourResult[];
}
