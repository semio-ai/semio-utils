import { describe, expect, it } from "vitest";
import { hslToRgba, rgbToRgba } from "./colors";

describe("rgbToRgba", () => {
  it("reads three comma-separated components, alone or inside rgb()", () => {
    expect(rgbToRgba("10, 20, 30", 0.5)).toBe("rgba(10, 20, 30, 0.50)");
    expect(rgbToRgba("rgb(255,0,128)", 1)).toBe("rgba(255, 0, 128, 1.00)");
  });

  it("refuses a component longer than three digits instead of reading part of it", () => {
    expect(() => rgbToRgba("1234, 5, 6", 1)).toThrow("Invalid RGB color.");
    expect(() => rgbToRgba("1, 2, 3456", 1)).toThrow("Invalid RGB color.");
  });

  it("stays linear on a long run of digits", () => {
    const started = performance.now();
    expect(() => rgbToRgba("9".repeat(100_000), 1)).toThrow("Invalid RGB color.");
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

describe("hslToRgba", () => {
  it("reads three comma-separated components", () => {
    expect(hslToRgba("0, 100, 50", 1)).toMatch(/^rgba\(/);
  });

  it("refuses a malformed value", () => {
    expect(() => hslToRgba("120 50 50", 1)).toThrow("Invalid HSL color.");
  });
});
