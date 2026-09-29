import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { RawValue } from "./animated-values";

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
 * The values-bridge subscription (in `apps/studio`) converts trackKey entries
 * into dotKey entries during playback so downstream consumers don't need to
 * know about the animation layer.
 *
 * ## Readers
 * - `useFeatures`, `useAnimatableSubscription` (`@semio/scene`, `@semio/vizij`)
 *   — scene rendering hooks subscribe to dotKey entries.
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
 * - `values-bridge-subscription.ts` (studio) — writes converted trackKey →
 *   dotKey entries.
 *
 * ## Gizmo writes (override seam)
 * Scene primitives that write values back (e.g. joint gizmos) go through
 * `SceneValueWriterContext` from `@semio/scene` — they call
 * `useSceneValueWriter().setValue(id, namespace, value)` rather than touching
 * this store directly. The default writer hits `updateValues` here. Studio
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
export const useValuesStore = create<ValuesStore>()(
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
