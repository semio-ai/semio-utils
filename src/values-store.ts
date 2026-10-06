import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { RawValue } from "./animated-values";
import type { AroraValue, DataStore, StateChange } from "./data-store";
import { fromTaggedValue, toTaggedValue, type ScalarValue } from "./scene-binding";

export interface ValuesData {
  values: Map<string, RawValue | undefined>;
  velocities: Map<string, RawValue | undefined>;
}

export interface ValuesActions {
  updateValues: (values: Map<string, RawValue | undefined>) => void;
  updateVelocities: (velocities: Map<string, RawValue | undefined>) => void;
  setTrackValue: (trackKey: string, value: RawValue) => void;
  /** Replace both maps at once (used by derived orchestrator). */
  replaceAll: (
    values: Map<string, RawValue | undefined>,
    velocities: Map<string, RawValue | undefined>,
  ) => void;
}

export type ValuesStore = ValuesData & ValuesActions;

/**
 * Merge `updates` into `base`, returning a new Map.
 * Keys mapped to `undefined` in `updates` are deleted from the result.
 */
export function mergeValueMaps(
  base: Map<string, RawValue | undefined>,
  updates: Map<string, RawValue | undefined>,
): Map<string, RawValue | undefined> {
  if (updates.size === 0) return base;

  // Check if any update actually differs before cloning
  let hasChange = false;
  updates.forEach((value, key) => {
    if (hasChange) return;
    if (value === undefined) {
      if (base.has(key)) hasChange = true;
    } else if (base.get(key) !== value) {
      hasChange = true;
    }
  });
  if (!hasChange) return base;

  const merged = new Map(base);
  updates.forEach((value, key) => {
    if (value === undefined) {
      merged.delete(key);
    } else {
      merged.set(key, value);
    }
  });
  return merged;
}

/**
 * Standalone Zustand store for high-frequency transient values and velocities.
 *
 * **Single source of truth for runtime animatable values.** Scene rendering,
 * animation editor controls, and device commanders all read from this store.
 * The studio/animation/scene stores own *structure* (animatables, tracks,
 * world, namespaces); this store owns *current numeric state*.
 *
 * ## Why a separate store
 * During playback the derived orchestrator writes new interpolated values at
 * ~40 Hz. A dedicated store with `subscribeWithSelector` means only the
 * consumers that need per-tick updates re-evaluate; subscribers of the other
 * stores aren't woken on every tick. `mergeValueMaps` additionally returns
 * the same Map reference when no values changed, so redundant writes don't
 * fan out to subscribers.
 *
 * ## Key formats
 * Two key formats coexist in the maps:
 * - **trackKey** (`namespaceId/instanceId/trackId`) — written by the derived
 *   orchestrator during playback. Only meaningful to the animation system.
 * - **dotKey** (`namespaceId.animatableId`) — used by scene rendering hooks
 *   and device command subscriptions.
 *
 * During playback the dotKeys follow the emulated devices, which play the
 * animation (Studio's `StudioAroraRuntime` projects them), so downstream
 * consumers don't need to know about the animation layer.
 *
 * ## Readers
 * - `useFeatures`, `useAnimatableSubscription` (`@semio/scene`, `vizij`) —
 *   scene rendering hooks subscribe to dotKey entries through the
 *   {@link DataStore} port, which Studio implements over this store
 *   ({@link valuesDataStore}).
 * - `AnimatableControl`, `AnimatableEditor` (`@semio/animation`) — animation
 *   editor controls subscribe to trackKey or dotKey entries.
 * - `device-subscriptions.ts` (studio) — outbound device commands and
 *   trajectories read dotKey entries.
 *
 * ## Writers
 * - `setValueDirectAction` (studio) — direct user edits.
 * - `device-subscriptions.ts` `onData` handler (studio) — incoming device
 *   feedback writes feedback-namespace dotKeys.
 * - `namespace-subscription.ts` (studio) — writes root-transform dotKeys for
 *   target/feedback/sim instances when entity config changes.
 * - `init-derived-orchestrator.ts` (`@semio/animation`) — writes trackKey
 *   values during playback.
 * - `StudioAroraRuntime` (studio) — projects the shared Arora store's changes
 *   onto dotKey entries once per frame, through `SceneBinding`.
 *
 * ## Gizmo writes (override seam)
 * Scene primitives that write values back (e.g. joint gizmos) go through
 * `SceneValueWriterContext` from `@semio/scene` — they call
 * `useSceneValueWriter().setValue(id, namespace, value)` rather than touching
 * this store directly. The default writer writes the key through the injected
 * {@link DataStore}, which in Studio is this store. Studio
 * overrides the writer to route through its animation-aware `setValueAction`,
 * which produces a keypoint update or a direct write depending on the entity's
 * controlMode and selected animation instance. See `packages/scene/README.md`.
 *
 * ## Lifecycle
 * Studio's project load leaves this singleton in place. Post-load subscribers
 * (`namespace-subscription`, derived orchestrator) overwrite relevant entries,
 * but entries for removed animatables can remain until their removal paths
 * explicitly clear them or the application reloads.
 */
export const useValuesStore = createValuesStore();

/**
 * A values store of its own, shaped like {@link useValuesStore}: for a host
 * that runs a scene, a face or a timeline on values nothing else shares (a
 * story, a preview), behind {@link valuesDataStore}.
 */
export function createValuesStore() {
  return create<ValuesStore>()(
    subscribeWithSelector((set) => ({
      values: new Map(),
      velocities: new Map(),

      updateValues: (updates) => {
        set((state) => ({
          values: mergeValueMaps(state.values, updates),
        }));
      },

      updateVelocities: (updates) => {
        set((state) => ({
          velocities: mergeValueMaps(state.velocities, updates),
        }));
      },

      setTrackValue: (trackKey, value) => {
        set((state) => {
          const next = new Map(state.values);
          next.set(trackKey, value);
          return { values: next };
        });
      },

      replaceAll: (values, velocities) => {
        set({ values, velocities });
      },
    })),
  );
}

type ValuesStoreApi = ReturnType<typeof createValuesStore>;

/**
 * A values store seen through the {@link DataStore} port, which is how the
 * scene, Vizij and animation packages read it: its keys as they are, each
 * scalar as its tagged arora `Value`. Studio injects the one over
 * {@link useValuesStore}; a story injects one over a store of its own.
 *
 * The values store holds scalars: composite values are flattened to one key
 * per axis before they reach it. A key holding anything else reads as absent,
 * and writing anything but a scalar throws.
 *
 * One subscription to the values store serves every subscriber of the port,
 * and each change is computed once and handed to all of them; so is the
 * whole-state change a new subscriber starts from, until the values move.
 */
export function valuesDataStore(store: ValuesStoreApi): DataStore {
  const listeners = new Set<(change: StateChange) => void>();
  let stopWatching: (() => void) | undefined;
  let whole: { values: ValuesData["values"]; change: StateChange } | undefined;

  const tagged = (value: RawValue | undefined): AroraValue | undefined =>
    isScalar(value) ? toTaggedValue(value) : undefined;

  const wholeState = (): StateChange => {
    const { values } = store.getState();
    if (whole?.values !== values) {
      const set = new Map<string, AroraValue>();
      values.forEach((value, key) => {
        const t = tagged(value);
        if (t !== undefined) set.set(key, t);
      });
      whole = { values, change: { set, unset: new Set() } };
    }
    return whole.change;
  };

  const watch = () =>
    store.subscribe((state, previous) => {
      if (state.values === previous.values) return;
      const change = difference(previous.values, state.values, tagged);
      if (change.set.size === 0 && change.unset.size === 0) return;
      for (const listener of [...listeners]) listener(change);
    });

  return {
    read: (keys) => {
      const { values } = store.getState();
      return keys.map((key) => tagged(values.get(key)));
    },
    slot: (key) => ({
      get: () => tagged(store.getState().values.get(key)),
      set: (value) => {
        let raw: ScalarValue | undefined;
        if (value !== undefined) {
          raw = fromTaggedValue(value);
          if (raw === undefined) {
            throw new Error(`the values store holds scalars; ${JSON.stringify(value)} is not one`);
          }
        }
        store.getState().updateValues(new Map([[key, raw]]));
      },
    }),
    subscribe: (listener) => {
      listener(wholeState());
      listeners.add(listener);
      stopWatching ??= watch();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopWatching?.();
          stopWatching = undefined;
        }
      };
    },
  };
}

function isScalar(value: RawValue | undefined): value is ScalarValue {
  return typeof value === "number" || typeof value === "string" || typeof value === "boolean";
}

/** What turned `before` into `after`: the keys whose value changed or appeared, and the keys gone. */
function difference(
  before: ValuesData["values"],
  after: ValuesData["values"],
  tagged: (value: RawValue | undefined) => AroraValue | undefined,
): StateChange {
  const set = new Map<string, AroraValue>();
  const unset = new Set<string>();
  after.forEach((value, key) => {
    if (before.has(key) && before.get(key) === value) return;
    const t = tagged(value);
    if (t === undefined) unset.add(key);
    else set.set(key, t);
  });
  before.forEach((_, key) => {
    if (!after.has(key)) unset.add(key);
  });
  return { set, unset };
}
