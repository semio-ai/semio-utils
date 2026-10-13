# @semio/utils

## 0.3.0

### Minor Changes

- 856f872: `unitDisplay(units)` says how a numeric value with a given `units` string is shown and edited.
  - **Percentages show and edit as 0–100.** A value with units `%` is stored as its fraction (0.35) and shown as 35, the way radians are stored and shown in degrees. The conversion is display only.
  - **Each spelling of a unit maps to one code and one displayed symbol.**
    - `percent` and `percentage` are `%`.
    - `radian` and `radians` are radians, shown in degrees.
    - `degree` and `degrees` are `°`.
    - `meters` and `metres` are `m`, and `seconds` is `s`.
    - `dimensionless` shows no unit.
  - **Matching.** Words match in any case. Symbols match exactly, because case is what separates them: `m` is metres and `M` is not.
  - **Drag range.** A value with no finite bounds drags across a full turn for an angle and across the whole 0–100 for a percentage.
  - **Unrecognised units** are shown as written, unconverted.

### Patch Changes

- d9b51af: Ship the MIT license text in the package tarball, and make the third-party icon
  attributions in `@semio/ui`'s and `@semio/animation`'s `NOTICE` self-contained.
  The versions on npm declared `"license": "MIT"` while carrying none of its text,
  and the `NOTICE` files referred to a repository-root document that is not in the
  tarball — so `changeset publish` has to cut a release for the fix to reach a
  consumer.
- 10cdce0: `rgbToRgba` and `hslToRgba` read at most three digits per component, and refuse a component that is part of a longer run of digits instead of reading it whole. A long digit string no longer makes the parse quadratic.

## 0.2.0

### Minor Changes

- e5f82d6: Unify the animation timeline viewport and split it into three independent canvases (SEM-114).
  - **@semio/utils** (breaking): removed `Player.viewport` and the per-tick viewport rewrite; `seek()` is now a pure stamp-set and the `updatePlayerViewportCenter` action is gone. Consumers that read `Player.viewport` must move to `@semio/animation`'s `viewportMotion`.
  - **@semio/animation**: viewport state now lives in a module-level `viewportMotion` (`viewport-state.ts`) with a swappable follow-policy subscription; one rendering invariant (fixed scene, moving camera); the HUD portal is replaced by three independent canvases (timeline / tracks / minimap); playhead cart redesigned. `scrollOffset`/`verticalFitCounter` removed from the animation store; `useOrthoCameraSetup` and `hud-section` removed.
  - **@semio/ui**: `menuStateAtom` now defaults to expanded (`true`).

  Bumped `minor` rather than `major` because these packages are pre-1.0 (0.x), where breaking changes ship as a minor per semver convention.

## 0.1.0

### Minor Changes

- Migrate to React 19 with compiler enabled. Upgrade React Three Fiber to v9, drei to v10, and enable babel-plugin-react-compiler. Fix all TypeScript compatibility issues and add Canvas fade-in for R3F v9 async initialization.
