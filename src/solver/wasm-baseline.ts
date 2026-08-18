import { isPermutation } from "../tour";
import type { ObjectiveSpec, Rgb, TourResult } from "../types";
import type { TourSolver } from "./index";

type WasmModule = typeof import("../wasm/pkg/chromatour_core.js");

let wasmPromise: Promise<WasmModule> | undefined;

async function loadWasm(): Promise<WasmModule> {
  if (!wasmPromise) {
    wasmPromise = import("../wasm/pkg/chromatour_core.js").then(
      async (module) => {
        await module.default();
        return module;
      },
    );
  }
  return wasmPromise;
}

function flatten(colors: readonly Rgb[]): Uint8Array {
  const rgb = new Uint8Array(colors.length * 3);
  colors.forEach((color, index) => {
    rgb[index * 3] = color.r;
    rgb[index * 3 + 1] = color.g;
    rgb[index * 3 + 2] = color.b;
  });
  return rgb;
}

export class WasmBaselineSolver implements TourSolver {
  readonly name = "WASM baseline (multi-start greedy + 2-opt)";

  async solve(
    colors: readonly Rgb[],
    objective: ObjectiveSpec,
  ): Promise<TourResult> {
    if (colors.length === 0) {
      return { order: [], metrics: { cost: 0, worstEdge: 0 } };
    }

    const wasm = await loadWasm();
    const rgb = flatten(colors);
    const order = Array.from(wasm.solve_baseline(rgb, objective.power));

    if (!isPermutation(order, colors.length)) {
      throw new Error("WASM solver returned an invalid tour permutation");
    }

    return {
      order,
      metrics: {
        cost: wasm.tour_cost(rgb, new Uint32Array(order), objective.power),
        worstEdge: wasm.tour_worst_edge(rgb, new Uint32Array(order)),
      },
    };
  }
}
