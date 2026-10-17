/**
 * @fileoverview
 * Store for handling player state and actions. Provides a centralized
 * way to manage animation playback time, direction, bounds, and looping.
 *
 * Viewport state lives separately (see `viewport-state` in @semio/animation)
 * so the playhead can advance without fanning re-renders out to every
 * viewport subscriber.
 */

import { createContext } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { enableMapSet, produce } from "immer";
import * as THREE from "three";
import {
  Player,
  newPlayer,
  reset,
  play,
  pause,
  withBounds,
  withSpeed,
  withDirection,
  reversed,
  withBounce,
  withLooping,
  PlayerDirection,
} from "./player";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
enableMapSet();

/**
 * Core data structure for player state
 */
export interface PlayerData {
  /** The player instance containing current state */
  player: Player;
}

/**
 * Actions available for controlling the player
 */
export interface PlayerActions {
  /** Updates the total duration of the animation */
  updateDuration: (duration: number) => void;
  /** Updates the playback speed */
  updateSpeed: (speed: number) => void;
  /** Updates the playback direction */
  updateDirection: (direction: PlayerDirection) => void;
  /** Reverses the current playback direction */
  reverseDirection: () => void;
  /** Resets the player to initial state or specified time */
  resetPlayer: (time?: number) => void;
  /** Plays the animation */
  playPlayer: (speed?: number, direction?: PlayerDirection) => void;
  /** Pauses the animation */
  pausePlayer: () => void;
  /** Sets the player bounds */
  updatePlayerBounds: (start: number, end: number) => void;
  /** Updates one bound of the player */
  updatePlayerBound: (bound: "start" | "end", time?: number) => void;
  /** Update the player bounce setting */
  updateBounce: (bounce: boolean) => void;
  /** Update the player looping setting */
  updateLooping: (looping: boolean) => void;
}

export type PlayerStoreSetter = (
  partial:
    | (PlayerData & PlayerActions)
    | Partial<PlayerData & PlayerActions>
    | ((
        state: PlayerData & PlayerActions,
      ) => (PlayerData & PlayerActions) | Partial<PlayerData & PlayerActions>),
  replace?: false,
) => void;

export type PlayerStoreGetter = () => PlayerData & PlayerActions;

export const PlayerSlice = (set: PlayerStoreSetter) => ({
  player: newPlayer(),
  // Set the duration of the player. Also rescales bounds if they were at
  // the old default. Uses `produce` (rather than the spread+`withX` pattern
  // the other actions use) because the bounds rescaling is a multi-field
  // atomic conditional write. Viewport rescaling is handled separately by
  // the viewport-follow subscription.
  updateDuration: (duration: number) => {
    set(
      produce((state: PlayerData) => {
        const oldDuration = state.player.duration;
        state.player.duration = duration;
        // Scale bounds proportionally if they matched the old duration
        if (oldDuration > 0 && duration > 0) {
          const b = state.player.bounds;
          // Only rescale if bounds appear to be at the default [0, oldDuration]
          if (Math.abs(b[1] - oldDuration) < 1) {
            state.player.bounds = [b[0], duration];
          }
        }
      }),
    );
  },
  // Set the speed of the animation playback
  updateSpeed: (speed: number) => {
    set((state: PlayerData) => ({
      player: withSpeed(state.player, speed),
    }));
  },
  // Set the direction of the animation playback
  updateDirection: (direction: PlayerDirection) => {
    set((state: PlayerData) => ({
      player: withDirection(state.player, direction),
    }));
  },
  // Reverse the current direction of the animation playback
  reverseDirection: () => {
    set((state: PlayerData) => ({
      player: reversed(state.player),
    }));
  },
  // Set the time of the animation
  resetPlayer: (time?: number) => {
    set((state: PlayerData) => ({ player: reset(state.player, time) }));
  },
  // Play the animation
  playPlayer: (speed?: number, direction?: PlayerDirection) => {
    set((state: PlayerData) => ({ player: play(state.player, speed, direction) }));
  },
  // Pause the animation
  pausePlayer: () => {
    set((state: PlayerData) => ({ player: pause(state.player) }));
  },
  // Set the player bounds
  updatePlayerBounds: (start: number, end: number) => {
    set((state: PlayerData) => ({
      player: withBounds(state.player, [start, end]),
    }));
  },
  updatePlayerBound: (bound: "start" | "end", time?: number) => {
    set((state: PlayerData) => {
      const t = time ?? state.player.stamp;
      if (bound === "start" && state.player.bounds[1] <= t) {
        return {
          player: withBounds(state.player, [state.player.bounds[1], t]),
        };
      } else if (bound === "end" && state.player.bounds[0] >= t) {
        return {
          player: withBounds(state.player, [t, state.player.bounds[0]]),
        };
      } else if (bound === "start") {
        return {
          player: withBounds(state.player, [t, state.player.bounds[1]]),
        };
      } else {
        return {
          player: withBounds(state.player, [state.player.bounds[0], t]),
        };
      }
    });
  },
  updateBounce: (bounce: boolean) => {
    set((state: PlayerData) => ({
      player: withBounce(state.player, bounce),
    }));
  },
  updateLooping: (looping: boolean) => {
    set((state: PlayerData) => ({
      player: withLooping(state.player, looping),
    }));
  },
});

export const usePlayerStore = createPlayerStore();

/**
 * A player of its own, shaped like {@link usePlayerStore}: for a timeline whose
 * host has no player to share with it (a story, a standalone sheet).
 */
export function createPlayerStore() {
  return create<PlayerData & PlayerActions>()(subscribeWithSelector(PlayerSlice));
}

export type PlayerStore = ReturnType<typeof createPlayerStore>;

// This creates a context where the single app store is stored.
export const PlayerContext = createContext<PlayerStore | null>(null);
