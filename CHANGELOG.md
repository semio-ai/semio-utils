# @semio/utils

## 0.6.0

### Minor Changes

- 87f9c41: `@semio/utils` now holds only generic utilities, and is licensed Apache-2.0 instead of MIT. Semio's value model is in the new `@semio/data`, and code that serves one package is in that package. Import each removed name from its new home:
  - **`@semio/data`** — the value types and guards (`RawValue`, `RawBoolean`, `RawNumber`, `RawString`, `RawVector2`, `RawVector3`, `RawEuler`, `RawRGB`, `RawHSL`, `RawColor`, `AnimatableValue`, `AnimatableBoolean`, `AnimatableNumber`, `AnimatableString`, `AnimatableVector2`, `AnimatableVector3`, `AnimatableEuler`, `AnimatableColor`, `AnimatableGroupType`, `AnimatableGroupInfo`, `AnimatablePubInfo`, `DeprecatedComplexAnimatableValue`, `instanceOfRawNumber`, `instanceOfRawString`, `instanceOfRawVector2`, `instanceOfRawVector3`, `instanceOfRawEuler`, `instanceOfRawColor`, `instanceOfRawRGB`, `instanceOfRawHSL`, `isRawObject`, `warnUnexpectedFeatureValue`); `rawRGBToHex` and `rawHSLToHex`; the store port (`DataStore`, `Slot`, `AroraValue`, `StateChange`, `DataStoreContext`, `useDataStore`, `watchKey`); the values store (`useValuesStore`, `createValuesStore`, `valuesDataStore`, `mergeValueMaps`, `ValuesStore`, `ValuesData`, `ValuesActions`); the value encoding (`ScalarValue`, `TaggedValue`, `isNumberType`, `toTaggedValue`, `fromTaggedValue`); the id conventions (`entityNamespace`, `namespaceEntity`, `runtimeInputId`, `runtimeInputKey`); `getLookup`, `getNamespace`, `getId`; `storedEulerXYZtoRPY`.
  - **`@semio/animation`** — the player: `Player`, `PlayerDirection`, `newPlayer`, `usePlayerStore`, `PlayerStore`, `PlayerData`, `PlayerActions`, `PlayerSlice`, `PlayerStoreSetter`. Its transport combinators (`play`, `pause`, `reset`, `reversed`, `withBounce`, `withBounds`, `withDirection`, `withLooping`, `withSpeed`) and `createPlayerStore` are internal to `@semio/animation`.
  - **`@semio/ui`** — the React context helpers, which `@semio/ui` already exported: `createContextSolution`, `withOptionalContext`, `createContextHook`, `createContextProvider`, `composeContexts`, `useOptionalContext`, `createContextChecker`, `ContextConfig`, `ContextSolutionConfig`, `OptionalContextProps`.
  - **Studio** (not published) — the scene binding (`SceneBinding`, `SceneBindingEntry`, `BoundEntity`, `BoundInstances`, `FollowedInstance`, `KeyTable`, `InputKeys`, `FeedbackKeys`, `RuntimeInput`, `TargetBinding`, `keyTableOf`, `parseKeyTable`, `followedDeviceId`, `bareInputKey`) and the error report (`ErrorReport`, `ErrorReportContext`, `createErrorReport`, `formatErrorReport`, `toDiagnosticError`, `DiagnosticError`). `storeKeyFor`, `AnimatableKeys` and `redactDiagnosticText` are internal to it.

  The React context and the stores among the moved names (`DataStoreContext`, `useValuesStore`, `usePlayerStore`) are new instances in their new packages, not aliases of this package's: a host provides and reads each from the same package as the libraries it renders.

  Removed, with no replacement: `getHexagonPath`, `getDegenerateHexagonPath`, `pointsToPath`, `useLazy`, `log`, `isMapDeepEqual`, `MapDeepEqualOptions`, `MapFilterFn`, `numberToDurationString`, `useMediaQuery`, `instanceOfRawBoolean`, `seek`, `withDuration`, `PlayerContext`, `PlayerStoreGetter`, `ContextValue`, and `WithTooltipContextProps` (`@semio/ui` exports its own).

  What remains: results and progress (`Result`, `Progress`, …), JSON and download helpers, the `EMAIL` pattern, angle conversion, euler and quaternion math, `pairwise`, `overlappingSegments`, `closestFrame`, colour helpers, `useDeepSelector` / `useDeep`, zustand helper types, three.js camera guards, `unitDisplay`, and the canvas frameloop setting.

## 0.5.0

### Minor Changes

- a26939f: The store port the scene and Vizij packages read values through: Arora's data store interface, injected by the host.
  - **`DataStore`** — `read(keys)`, `slot(key)` (a `Slot` with `get` and `set`) and `subscribe(listener)`, whose first call is the store's whole state and every later one a `StateChange` (`{ set, unset }`). Values are arora `Value`s in their tagged JSON form (`AroraValue`, `{ "f64": 0.5 }`).
  - **`DataStoreContext`** and **`useDataStore()`**, which throws when no provider injects a store.
  - **`watchKey(store, key, fallback, onValue)`** — an animatable's key as the packages read it: its scalar, or the fallback while the key holds none, now and at each change.
  - **`createValuesStore()`** makes a values store of one's own, shaped like `useValuesStore`; **`valuesDataStore(store)`** presents one through the port, which is how Studio injects `useValuesStore`.

- 4bb39a2: Add versioned, transport-neutral diagnostic reports compatible with structured
  Result errors, JavaScript exceptions, and Rust error adapters. Reports preserve
  error kinds, codes, bounded causes and optional stacks/backtraces, allowlist UI
  context, and redact common credentials and URL queries.

  Add optional medium sizing and a custom footer to Dialog, with scrolling body
  content and fixed header/footer controls for long reports.

- 6e59734: `SceneBinding`: the table between the shared Arora store's keys and the dot keys the scene reads, with the value conversions at the JS boundary. Every key it reads is a device's: an entity owns no namespace in the store.
  - **Keys come from the World.** An animatable's name (`pub.output` when non-empty and unique within the entity, else the id) is the World's rule; `parseKeyTable` reads the table a spawn returns, and the World's `inputKeys` and `feedbackKeys` tables (`InputKeys`, `FeedbackKeys`): the input key each animatable's writes address on an entity, and the input and feedback keys each bound device keeps it under (`k/target.c`, `k.target_c` or `k`; an axis spelled from its group's key, the axis after the component in the new form), resolved per device by the World.
  - **`storeKeyFor`** gives the store key an entity's instance reads, from the animatable's `AnimatableKeys` (its feedback and input keys on each device): for `target`, the input under the device the view follows (`FollowedInstance`, `sim` unless `feedback` is asked for, resolved by `followedDeviceId`), nothing when that device does not drive it; for `sim` and `feedback`, the device's feedback under the instance id.
  - **`SceneBinding`** is built from the spawned entities, the device each one's view follows, their models' animatables, the World's key table and the input keys of the entity and the input and feedback keys of each bound device (`inputs`, `deviceInputs`, `deviceFeedback`), and reads both ways: `dotKeysFor` fans a store key out to every dot key bound to it, `targetFor` resolves a write on a target dot key to a `TargetBinding` — the entity and input key the write is addressed to, and the store key that holds what the followed device received. `getLookup`'s dot keys are unchanged.
  - **`toTaggedValue` / `fromTaggedValue`** convert between a scalar and arora's externally tagged `Value` JSON (`{"f64": n}`, `{"str": s}`, `{"bool": b}`).

- 0a439db: `keyTableOf` gives the key table the World's rule gives an entity's animatables: each animatable's `pub.output` when it is non-empty and no other of them publishes the same output, else its id. `bareInputKey` spells an animatable's bare input from that key: the key itself, or for an axis of a structured value, its group's key then the axis. A device that renders those animatables and opens each one's bare input is written there by the World. The World stays the authority on both, and Studio's side keeps reading the tables the World returns.
- 6371a2a: - **`createPlayerStore()`** makes a player of one's own, shaped like `usePlayerStore`: the player a standalone timeline shows when its host shares none with it.
  - **`namespaceEntity(namespace)`**, the inverse of `entityNamespace`: the entity a scene instance's namespace (`entityId@instanceId`) belongs to, a namespace that names no instance being the entity's own id. The animation package and Studio's entity actions read the form through it.
- a764cdc: `SceneBinding` binds the inputs an entity's runtime declares beyond its animatables (`SceneBindingEntry.runtimeInputs`, `RuntimeInput`): each is shown on the `target` instance under `runtimeInputId(key)`, read from the runtime (the `sim` instance's device), and a write on it resolves to the entity and the key, with the arora type the runtime declares (`TargetBinding.ty`; `TargetBinding.animatable` is absent for such an input). `runtimeInputKey` reads a key back from its id. `isNumberType` says whether an arora type name is a number's.

### Patch Changes

- f286b72: `SceneBinding`'s documentation states what a view reads from it, the seam a Bevy view takes: the store keys it shows (`storeKeys`) and the features each feeds (`dotKeysFor`), strings only.

## 0.4.0

### Minor Changes

- 718aa2c: Expose an optional, reactive canvas render-loop setting for host apps. Default to continuous rendering and leave demand-mode invalidation scheduling to the host.

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
