import { describe, expect, test } from "bun:test";
import { parseHexColors } from "./colors";

describe("parseHexColors", () => {
  test("parses comma and newline separated six-digit colors", () => {
    expect(parseHexColors("#958F86, #D8B87C,\n#0F201D")).toEqual([
      { r: 0x95, g: 0x8f, b: 0x86 },
      { r: 0xd8, g: 0xb8, b: 0x7c },
      { r: 0x0f, g: 0x20, b: 0x1d },
    ]);
  });

  test("accepts shorthand and optional hash", () => {
    expect(parseHexColors("#abc 123")).toEqual([
      { r: 0xaa, g: 0xbb, b: 0xcc },
      { r: 0x11, g: 0x22, b: 0x33 },
    ]);
  });

  test("rejects invalid tokens instead of silently dropping them", () => {
    expect(() => parseHexColors("#112233, nope, #abcdef")).toThrow(
      "Invalid color",
    );
  });
});
