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
 * ## Why a separate store?
 * During playback the derived orchestrator writes new interpolated values at
 * ~40 Hz. Before extraction these writes hit the main animation/studio store,
 * triggering every `subscribeWithSelector` subscriber to re-evaluate. Moving
 * `values` and `velocities` here limits notification to the handful of
 * consumers that actually need per-tick updates (device commands, scene
 * rendering, animatable controls).
 *
 * ## Key formats
 * Two key formats coexist in the maps:
 * - **trackKey** (`namespaceId/instanceId/trackId`) — written by the derived
 *   orchestrator during playback. Only meaningful to the animation system.
 * - **dotKey** (`namespaceId.animatableId`) — used by scene rendering hooks
 *   and device command subscriptions.
 *
 * The values-bridge subscription converts trackKey entries to dotKey entries
 * so downstream consumers don't need to know about the animation layer.
 *
 * ## Dual-write contract with SceneData.values
 * Scene rendering hooks (e.g. `useSceneStore`) read from the main store's
 * `SceneData.values` map, **not** from this store. Any code path that writes
 * **dotKey** values here **must also** write them to `SceneData.values` on the
 * main store. This dual-write is currently performed by three sites:
 *
 * 1. `values-bridge-subscription.ts` — converts trackKey → dotKey during
 *    playback and writes both stores.
 * 2. `values-actions.ts` (`setValueDirectAction`) — direct user edits via
 *    animatable controls.
 * 3. `device-subscriptions.ts` (`onData` handler) — incoming device feedback.
 *
 * **trackKey-only writes do NOT need a dual-write** because the values-bridge
 * subscription automatically converts them to dotKeys.
 *
 * If you add a new code path that writes dotKey values, you must follow the
 * same dual-write pattern or scene rendering will not reflect the change.
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
