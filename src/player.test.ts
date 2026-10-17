import { describe, it, expect, beforeEach } from "vitest";
import {
  Player,
  PlayerDirection,
  newPlayer,
  play,
  pause,
  reset,
  withBounds,
  withSpeed,
  withDirection,
  reversed,
  withDuration,
  withBounce,
  withLooping,
} from "./player";

describe("Player", () => {
  let player: Player;

  beforeEach(() => {
    player = newPlayer();
  });

  describe("newPlayer", () => {
    it("creates a player with default values", () => {
      expect(player.running).toBe(false);
      expect(player.stamp).toBe(0);
      expect(player.speed).toBe(1);
      expect(player.direction).toBe(PlayerDirection.Forward);
      expect(player._currentDirection).toBe(PlayerDirection.Forward);
      expect(player._bounced).toBe(false);
      expect(player._enteredBounds).toBe(false);
      expect(player.bounds).toEqual([0, 5000]);
      expect(player.bounce).toBe(false);
      expect(player.looping).toBe(true);
      expect(player.duration).toBe(5000);
    });
  });

  describe("play", () => {
    it("starts the player running", () => {
      const playingPlayer = play(player);
      expect(playingPlayer.running).toBe(true);
    });

    it("sets speed and direction when provided", () => {
      const playingPlayer = play(player, 2, PlayerDirection.Reverse);
      expect(playingPlayer.speed).toBe(2);
      expect(playingPlayer.direction).toBe(PlayerDirection.Reverse);
      expect(playingPlayer._currentDirection).toBe(PlayerDirection.Reverse);
    });

    it("ensures speed is always positive", () => {
      const playingPlayer = play(player, -3);
      expect(playingPlayer.speed).toBe(3);
    });

    describe("reverse playback positioning", () => {
      it("moves to end when playing reverse from start", () => {
        const playerAtStart = { ...player, stamp: 0 };
        const playingPlayer = play(playerAtStart, undefined, PlayerDirection.Reverse);
        expect(playingPlayer.stamp).toBe(5000); // Should move to end of bounds
        expect(playingPlayer._currentDirection).toBe(PlayerDirection.Reverse);
      });

      it("moves to end when playing reverse from near start", () => {
        const playerNearStart = { ...player, stamp: 0.0005 };
        const playingPlayer = play(playerNearStart, undefined, PlayerDirection.Reverse);
        expect(playingPlayer.stamp).toBe(5000); // Should move to end of bounds
        expect(playingPlayer._currentDirection).toBe(PlayerDirection.Reverse);
      });

      it("does not move when playing reverse from middle", () => {
        const playerInMiddle = { ...player, stamp: 2500 };
        const playingPlayer = play(playerInMiddle, undefined, PlayerDirection.Reverse);
        expect(playingPlayer.stamp).toBe(2500); // Should stay in middle
        expect(playingPlayer._currentDirection).toBe(PlayerDirection.Reverse);
      });

      it("respects custom bounds when playing reverse", () => {
        const boundedPlayer = withBounds(player, [1000, 4000]);
        const playerAtBoundStart = { ...boundedPlayer, stamp: 1000 };
        const playingPlayer = play(playerAtBoundStart, undefined, PlayerDirection.Reverse);
        expect(playingPlayer.stamp).toBe(4000); // Should move to end of custom bounds
        expect(playingPlayer._currentDirection).toBe(PlayerDirection.Reverse);
      });
    });

    describe("forward playback positioning", () => {
      it("moves to start when playing forward from end", () => {
        const playerAtEnd = { ...player, stamp: 5000 };
        const playingPlayer = play(playerAtEnd, undefined, PlayerDirection.Forward);
        expect(playingPlayer.stamp).toBe(0); // Should move to start of bounds
        expect(playingPlayer._currentDirection).toBe(PlayerDirection.Forward);
      });

      it("moves to start when playing forward from near end", () => {
        const playerNearEnd = { ...player, stamp: 4999.9995 };
        const playingPlayer = play(playerNearEnd, undefined, PlayerDirection.Forward);
        expect(playingPlayer.stamp).toBe(0); // Should move to start of bounds
        expect(playingPlayer._currentDirection).toBe(PlayerDirection.Forward);
      });

      it("does not move when playing forward from middle", () => {
        const playerInMiddle = { ...player, stamp: 2500 };
        const playingPlayer = play(playerInMiddle, undefined, PlayerDirection.Forward);
        expect(playingPlayer.stamp).toBe(2500); // Should stay in middle
        expect(playingPlayer._currentDirection).toBe(PlayerDirection.Forward);
      });
    });

    describe("no loop, no bounce mode", () => {
      it("resets to start when playing forward after completion", () => {
        const oncePlayer = withBounce(withLooping(player, false), false);
        const playerAtEnd = { ...oncePlayer, stamp: 5000 };
        const playingPlayer = play(playerAtEnd, undefined, PlayerDirection.Forward);
        expect(playingPlayer.stamp).toBe(0);
      });

      it("resets to end when playing reverse after completion", () => {
        const oncePlayer = withBounce(withLooping(player, false), false);
        const playerAtStart = { ...oncePlayer, stamp: 0 };
        const playingPlayer = play(playerAtStart, undefined, PlayerDirection.Reverse);
        expect(playingPlayer.stamp).toBe(5000);
      });
    });
  });

  describe("pause", () => {
    it("stops the player", () => {
      const runningPlayer = play(player);
      const pausedPlayer = pause(runningPlayer);
      expect(pausedPlayer.running).toBe(false);
    });

    it("preserves other properties", () => {
      const runningPlayer = play(player, 2, PlayerDirection.Reverse);
      const pausedPlayer = pause(runningPlayer);
      expect(pausedPlayer.speed).toBe(2);
      expect(pausedPlayer.direction).toBe(PlayerDirection.Reverse);
    });

    it("resets direction to base direction when resuming after pause", () => {
      // Create a player that has bounced (current direction different from base direction)
      const bouncePlayer = withBounce(withLooping(player, true), true);
      const playerAfterBounce = {
        ...bouncePlayer,
        direction: PlayerDirection.Forward as const,
        _currentDirection: PlayerDirection.Reverse as const, // Different from base direction
        _bounced: true,
        running: true,
      };

      // Pause the player
      const pausedPlayer = pause(playerAfterBounce);
      expect(pausedPlayer.running).toBe(false);
      expect(pausedPlayer.direction).toBe(PlayerDirection.Forward); // Base direction preserved
      expect(pausedPlayer._currentDirection).toBe(PlayerDirection.Reverse); // Current direction preserved during pause

      // Resume - should reset current direction to base direction
      const resumedPlayer = play(pausedPlayer);
      expect(resumedPlayer.running).toBe(true);
      expect(resumedPlayer.direction).toBe(PlayerDirection.Forward); // Base direction unchanged
      expect(resumedPlayer._currentDirection).toBe(PlayerDirection.Forward); // Reset to base direction
      expect(resumedPlayer._bounced).toBe(false); // Bounce state reset
    });
  });

  describe("withSpeed", () => {
    it("sets speed and ensures it is positive", () => {
      const speedPlayer = withSpeed(player, 5);
      expect(speedPlayer.speed).toBe(5);
    });

    it("throws an error if a negative speed is specified", () => {
      expect(() => withSpeed(player, -2)).toThrow("Speed must be a positive number");
    });

    it("preserves other properties", () => {
      const modifiedPlayer = { ...player, direction: PlayerDirection.Reverse as const };
      const speedPlayer = withSpeed(modifiedPlayer, 3);
      expect(speedPlayer.direction).toBe(PlayerDirection.Reverse);
    });
  });

  describe("withDirection", () => {
    it("sets direction and current direction", () => {
      const directionPlayer = withDirection(player, PlayerDirection.Reverse);
      expect(directionPlayer.direction).toBe(PlayerDirection.Reverse);
      expect(directionPlayer._currentDirection).toBe(PlayerDirection.Reverse);
    });

    it("preserves other properties", () => {
      const modifiedPlayer = { ...player, speed: 3 };
      const directionPlayer = withDirection(modifiedPlayer, PlayerDirection.Reverse);
      expect(directionPlayer.speed).toBe(3);
    });
  });

  describe(PlayerDirection.Reverse, () => {
    it("flips direction and current direction from forward to reverse", () => {
      const reversedPlayer = reversed(player);
      expect(reversedPlayer.direction).toBe(PlayerDirection.Reverse);
      expect(reversedPlayer._currentDirection).toBe(PlayerDirection.Reverse);
    });

    it("flips direction and current direction from reverse to forward", () => {
      const reversePlayer = withDirection(player, PlayerDirection.Reverse);
      const forwardPlayer = reversed(reversePlayer);
      expect(forwardPlayer.direction).toBe(PlayerDirection.Forward);
      expect(forwardPlayer._currentDirection).toBe(PlayerDirection.Forward);
    });
  });

  describe("withBounds", () => {
    it("sets new bounds", () => {
      const boundedPlayer = withBounds(player, [1000, 4000]);
      expect(boundedPlayer.bounds).toEqual([1000, 4000]);
    });
  });

  describe("withDuration", () => {
    it("sets new duration", () => {
      const durationPlayer = withDuration(player, 5000);
      expect(durationPlayer.duration).toBe(5000);
    });
  });

  describe("reset", () => {
    it("resets to stamp 0 by default", () => {
      const modifiedPlayer = { ...player, stamp: 2500 };
      const resetPlayer = reset(modifiedPlayer);
      expect(resetPlayer.stamp).toBe(0);
    });

    it("resets to specified stamp", () => {
      const modifiedPlayer = { ...player, stamp: 2500 };
      const resetPlayer = reset(modifiedPlayer, 3500);
      expect(resetPlayer.stamp).toBe(3500);
    });

    it("resets current direction to match direction", () => {
      const modifiedPlayer = {
        ...player,
        direction: PlayerDirection.Forward as const,
        _currentDirection: PlayerDirection.Reverse as const,
      };
      const resetPlayer = reset(modifiedPlayer);
      expect(resetPlayer._currentDirection).toBe(PlayerDirection.Forward);
      expect(resetPlayer._bounced).toBe(false);
      expect(resetPlayer._enteredBounds).toBe(false);
    });
  });

  describe("withBounce", () => {
    it("sets bounce property", () => {
      const bouncePlayer = withBounce(player, true);
      expect(bouncePlayer.bounce).toBe(true);
    });

    it("preserves other properties", () => {
      const modifiedPlayer = { ...player, speed: 3 };
      const bouncePlayer = withBounce(modifiedPlayer, true);
      expect(bouncePlayer.speed).toBe(3);
    });
  });

  describe("withLooping", () => {
    it("sets looping property", () => {
      const loopingPlayer = withLooping(player, false);
      expect(loopingPlayer.looping).toBe(false);
    });

    it("preserves other properties", () => {
      const modifiedPlayer = { ...player, speed: 3 };
      const loopingPlayer = withLooping(modifiedPlayer, false);
      expect(loopingPlayer.speed).toBe(3);
    });
  });
});
