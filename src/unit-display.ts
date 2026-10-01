import { toDegrees, toRadians } from "./angles";

/**
 * How a numeric value carrying a given `units` string is shown and edited.
 *
 * ## Display only — the stored value never changes
 *
 * `toDisplay` and `fromDisplay` sit between the stored value and what a person
 * reads or edits, and nowhere else. Tracks, playback, the curve graph and the
 * effective-motion export all keep the stored value: radians stay radians and a
 * percentage stays the fraction it is stored as (0.35, shown as 35). An exported
 * animation is played on a robot from those stored values and their `units` string,
 * so a conversion applied anywhere past the display would change what the robot
 * receives.
 *
 * ## Why units are normalized here
 *
 * `units` is free text written by whoever authored the model, so one unit arrives
 * under several spellings ("%", "percent", "percentage"). Each spelling maps to one
 * {@link UnitDisplay.code}, which is what icons and semantic labels key on, and to
 * the short symbol a field shows. A string this does not recognise is shown as
 * written, unconverted.
 *
 * Words match in any case ("Percent", "DEGREES"). Symbols match exactly, because
 * case is what separates them: `m` is metres and `M` is not, `ms` is milliseconds
 * and `Ms` is not.
 */
export interface UnitDisplay {
  /**
   * The unit's canonical code: `"rad"`, `"deg"`, `"%"`, `"m"`, ... — `"none"` for a
   * value with no unit, or the trimmed string itself when it is not recognised.
   */
  code: string;
  /** The suffix a field shows, or undefined to show none. */
  label: string | undefined;
  /** Stored value to the value a person sees and edits. */
  toDisplay: (stored: number) => number;
  /** The value a person entered back to the stored value. */
  fromDisplay: (shown: number) => number;
  /**
   * How far, in displayed units, a drag across a field moves a value that has no
   * finite bounds to scale the drag by: a full turn for an angle, the whole 0–100
   * for a percentage. Undefined leaves the field's own default.
   */
  relativeDragRange: number | undefined;
}

const identity = (value: number) => value;

interface KnownUnit {
  code: string;
  label: string | undefined;
  toDisplay?: (stored: number) => number;
  fromDisplay?: (shown: number) => number;
  relativeDragRange?: number;
}

const RADIANS: KnownUnit = {
  code: "rad",
  label: "°",
  toDisplay: toDegrees,
  fromDisplay: toRadians,
  relativeDragRange: 360,
};
const DEGREES: KnownUnit = { code: "deg", label: "°", relativeDragRange: 360 };
/** Stored as the fraction (0.35), shown and edited as the percentage (35). */
const PERCENT: KnownUnit = {
  code: "%",
  label: "%",
  toDisplay: (stored) => stored * 100,
  fromDisplay: (shown) => shown / 100,
  relativeDragRange: 100,
};
const METRES: KnownUnit = { code: "m", label: "m" };
const SECONDS: KnownUnit = { code: "s", label: "s" };
const NO_UNIT: KnownUnit = { code: "none", label: undefined };

/** Symbols, matched exactly: their case carries meaning. */
const SYMBOLS = new Map<string, KnownUnit>([
  ["°", DEGREES],
  ["%", PERCENT],
  ["m", METRES],
  ["mm", { code: "mm", label: "mm" }],
  ["cm", { code: "cm", label: "cm" }],
  ["km", { code: "km", label: "km" }],
  ["s", SECONDS],
  ["ms", { code: "ms", label: "ms" }],
]);

/** Words and unambiguous abbreviations, matched in any case. */
const WORDS = new Map<string, KnownUnit>([
  ["rad", RADIANS],
  ["radian", RADIANS],
  ["radians", RADIANS],
  ["deg", DEGREES],
  ["degree", DEGREES],
  ["degrees", DEGREES],
  ["percent", PERCENT],
  ["percentage", PERCENT],
  ["meter", METRES],
  ["meters", METRES],
  ["metre", METRES],
  ["metres", METRES],
  ["sec", SECONDS],
  ["second", SECONDS],
  ["seconds", SECONDS],
  ["dimensionless", NO_UNIT],
  ["unitless", NO_UNIT],
  ["none", NO_UNIT],
]);

export function unitDisplay(units: string | undefined): UnitDisplay {
  const trimmed = units?.trim() ?? "";
  const known =
    trimmed === "" ? NO_UNIT : (SYMBOLS.get(trimmed) ?? WORDS.get(trimmed.toLowerCase()));
  if (!known) {
    return {
      code: trimmed,
      label: trimmed,
      toDisplay: identity,
      fromDisplay: identity,
      relativeDragRange: undefined,
    };
  }
  return {
    code: known.code,
    label: known.label,
    toDisplay: known.toDisplay ?? identity,
    fromDisplay: known.fromDisplay ?? identity,
    relativeDragRange: known.relativeDragRange,
  };
}
