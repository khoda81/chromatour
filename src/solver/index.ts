import type { ObjectiveSpec, Rgb, TourResult } from "../types";

export interface TourSolver {
  readonly name: string;
  solve(colors: readonly Rgb[], objective: ObjectiveSpec): Promise<TourResult>;
}

export { ContinuousWasmSolver } from "./continuous-wasm";
export { WasmBaselineSolver } from "./wasm-baseline";
