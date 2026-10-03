import { describe, expect, test } from "vitest";
import { unitDisplay } from "../unit-display";

describe("unitDisplay", () => {
  test("shows a percentage as 0..100 and stores it back as the fraction", () => {
    const display = unitDisplay("%");
    expect(display.label).toBe("%");
    expect(display.toDisplay(0.35)).toBeCloseTo(35);
    expect(display.fromDisplay(50)).toBeCloseTo(0.5);
    // Edits outside 0..100 are not clamped here; a field's limits decide.
    expect(display.fromDisplay(150)).toBeCloseTo(1.5);
  });

  test("shows radians as degrees and stores degrees back as radians", () => {
    const display = unitDisplay("rad");
    expect(display.label).toBe("°");
    expect(display.toDisplay(Math.PI)).toBeCloseTo(180);
    expect(display.fromDisplay(90)).toBeCloseTo(Math.PI / 2);
  });

  test("drags an unbounded value across a full turn or the whole 0..100", () => {
    expect(unitDisplay("rad").relativeDragRange).toBe(360);
    expect(unitDisplay("deg").relativeDragRange).toBe(360);
    expect(unitDisplay("%").relativeDragRange).toBe(100);
    expect(unitDisplay("m").relativeDragRange).toBeUndefined();
    expect(unitDisplay("intensity").relativeDragRange).toBeUndefined();
  });

  test("maps each spelling of a unit to one code and one short symbol", () => {
    for (const units of ["%", "percent", "Percentage", " percentage "]) {
      const display = unitDisplay(units);
      expect([display.code, display.label, display.toDisplay(0.2)]).toEqual(["%", "%", 20]);
    }
    for (const units of ["rad", "Rad", "radian", "RADIANS"]) {
      expect([unitDisplay(units).code, unitDisplay(units).label]).toEqual(["rad", "°"]);
    }
    for (const units of ["deg", "degrees", "°"]) {
      expect([unitDisplay(units).code, unitDisplay(units).label]).toEqual(["deg", "°"]);
      expect(unitDisplay(units).toDisplay(45)).toBe(45);
    }
    for (const units of ["meters", "Metres"]) expect(unitDisplay(units).label).toBe("m");
    for (const units of ["sec", "Seconds"]) expect(unitDisplay(units).label).toBe("s");
  });

  test("matches a symbol only in its own case, because case is what tells symbols apart", () => {
    // `M`, `Mm` and `MS` are not metres, millimetres and milliseconds.
    for (const units of ["M", "Mm", "MS", "S"]) {
      const display = unitDisplay(units);
      expect([display.code, display.label]).toEqual([units, units]);
    }
  });

  test("shows no unit for a dimensionless or missing one, and leaves its value alone", () => {
    for (const units of ["dimensionless", "Unitless", "none", "", "  ", undefined]) {
      const display = unitDisplay(units);
      expect(display.code).toBe("none");
      expect(display.label).toBeUndefined();
      expect(display.toDisplay(0.25)).toBe(0.25);
    }
  });

  test("shows an unrecognised unit as written, without converting its value", () => {
    // Including the names an object's prototype carries, which are not units.
    for (const units of ["intensity", "constructor", "__proto__", "toString"]) {
      const display = unitDisplay(units);
      expect([display.code, display.label, display.toDisplay(0.35)]).toEqual([units, units, 0.35]);
    }
  });
});
