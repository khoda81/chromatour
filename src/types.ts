export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface ObjectiveSpec {
  /** Adjacent OKLab distances are scored as Σ d^power. */
  power: number;
}

export type SolverKind =
  | "ils-2opt"
  | "random-2opt"
  | "greedy-2opt"
  | "three-opt"
  | "annealing"
  | "lk"
  | "ant-colony";

export interface TourMetrics {
  /** Optimization-equivalent Lp quasi-norm of the adjacent distances. */
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
