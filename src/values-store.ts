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
 * Standalone values store for high-frequency transient data.
 *
 * `values` and `velocities` are written ~40 Hz during playback by the derived
 * orchestrator. Keeping them in a dedicated store prevents every other Zustand
 * subscriber on the main animation store from being notified on every tick.
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
