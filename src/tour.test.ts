import { describe, expect, test } from "bun:test";
import { identityOrder, isPermutation } from "./tour";

describe("tour helpers", () => {
  test("identityOrder is a valid permutation", () => {
    expect(isPermutation(identityOrder(8), 8)).toBe(true);
  });

  test("duplicate indices are rejected", () => {
    expect(isPermutation([0, 1, 1], 3)).toBe(false);
  });

  test("out-of-range indices are rejected", () => {
    expect(isPermutation([0, 1, 3], 3)).toBe(false);
  });
});
