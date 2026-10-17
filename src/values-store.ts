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
  /** Replace both maps at once. */
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
 * During playback the Arora projection writes the devices' values every
 * frame. A dedicated store with `subscribeWithSelector` means only the
 * consumers that need per-tick updates re-evaluate; subscribers of the other
 * stores aren't woken on every tick. `mergeValueMaps` additionally returns
 * the same Map reference when no values changed, so redundant writes don't
 * fan out to subscribers.
 *
 * ## Key format
 * **dotKey** (`namespaceId.animatableId`) — used by scene rendering hooks,
 * the animation editor's direct controls and device command subscriptions.
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
 * - `AnimatableControl` (`@semio/animation`) — a direct control watches its
 *   dotKey entry through the same port.
 * - `device-subscriptions.ts` (studio) — outbound device commands and
 *   trajectories read dotKey entries.
 *
 * ## Writers
 * - `setValueDirectAction` (studio) — direct user edits.
 * - `device-subscriptions.ts` `onData` handler (studio) — incoming device
 *   feedback writes feedback-namespace dotKeys.
 * - `namespace-subscription.ts` (studio) — writes root-transform dotKeys for
 *   target/feedback/sim instances when entity config changes.
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
 * (`namespace-subscription`, the Arora projection) overwrite relevant entries,
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
 * scene, Vizij and animation packages read it: its keys as they are, each scalar as its
 * tagged arora `Value`. Studio injects the one over {@link useValuesStore}; a
 * story injects one over a store of its own.
 *
 * An animatable's value is a scalar. A key holding anything else (a composite
 * some writer still puts in the values store) reads as absent, and writing
 * anything but a scalar throws.
 *
 * One subscription to the values store serves every subscriber of the port,
 * and each change is computed once and handed to all of them; so is the
 * whole-state change a new subscriber starts from, until the values move.
 * Changes reach every subscriber in the order they were applied: a write a
 * subscriber makes while handling a change is handed on once that change has
 * reached every subscriber, and a subscriber that leaves during a change is
 * not called again.
 */
export function valuesDataStore(store: ValuesStoreApi): DataStore {
  const listeners = new Set<(change: StateChange) => void>();
  let stopWatching: (() => void) | undefined;
  let whole: { values: ValuesData["values"]; change: StateChange } | undefined;
  /** The values every subscriber has been handed. */
  let delivered: ValuesData["values"] = store.getState().values;
  let handing = false;

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

  /** Hands every subscriber what moved since `delivered`, until nothing has. */
  const handOn = () => {
    if (handing) return;
    handing = true;
    try {
      for (;;) {
        const { values } = store.getState();
        if (values === delivered) return;
        const change = difference(delivered, values, tagged);
        delivered = values;
        if (change.set.size === 0 && change.unset.size === 0) continue;
        for (const listener of [...listeners]) {
          if (listeners.has(listener)) listener(change);
        }
      }
    } finally {
      handing = false;
    }
  };

  const watch = () => {
    delivered = store.getState().values;
    return store.subscribe(handOn);
  };

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
      stopWatching ??= watch();
      // Registered before its first call, so a write it makes there reaches it.
      listeners.add(listener);
      listener(wholeState());
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

/**
 * What turned `before` into `after`, as subscribers read it: the keys whose
 * scalar changed or appeared, and the keys whose scalar is gone (removed, or
 * replaced by something that is no scalar).
 */
function difference(
  before: ValuesData["values"],
  after: ValuesData["values"],
  tagged: (value: RawValue | undefined) => AroraValue | undefined,
): StateChange {
  const set = new Map<string, AroraValue>();
  const unset = new Set<string>();
  const hadScalar = (key: string) => tagged(before.get(key)) !== undefined;
  after.forEach((value, key) => {
    if (before.has(key) && Object.is(before.get(key), value)) return;
    const t = tagged(value);
    if (t !== undefined) set.set(key, t);
    else if (hadScalar(key)) unset.add(key);
  });
  before.forEach((_, key) => {
    if (!after.has(key) && hadScalar(key)) unset.add(key);
  });
  return { set, unset };
}
