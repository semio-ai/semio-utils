/**
 * Time representation in milliseconds.
 */
export type RawTime = number;

export enum PlayerDirection {
  Reverse = "reverse",
  Forward = "forward",
}

/**
 * A timer implementation for managing animation playback.
 *
 * The timer operates in milliseconds, where:
 * - 0 represents the start of the animation
 * - duration (in ms) represents the end of the animation
 *
 * Fields prefixed with `_` (e.g. `_previousTime`, `_currentDirection`,
 * `_bounced`, `_enteredBounds`) are internal bookkeeping for the
 * `updated()` tick function and should not be read by external
 * consumers. They're on the public type because immutable spread-and-
 * return pattern means every `withX` helper must roundtrip them.
 *
 * @property running - Whether the timer is actively running
 * @property _previousTime - INTERNAL. Last update time in ms.
 * @property _currentTime - INTERNAL. Current update time in ms.
 * @property stamp - Current time position in milliseconds
 * @property speed - Playback speed multiplier (always positive)
 * @property direction - Initial playback direction (PlayerDirection.Forward or PlayerDirection.Reverse)
 * @property _currentDirection - INTERNAL. Actual movement direction during bouncing.
 * @property _bounced - INTERNAL. Whether the player has already bounced this run.
 * @property _enteredBounds - INTERNAL. Whether the player has crossed into bounds at least once.
 * @property bounds - Constrains playback to a [start, end] range in milliseconds
 * @property bounce - Whether to reverse direction when reaching bounds
 * @property looping - Whether to continue playing after reaching bounds
 * @property duration - Total animation duration in milliseconds (used for playback stepping)
 */
export interface Player {
  running: boolean;
  _previousTime: RawTime;
  _currentTime: RawTime;
  stamp: number;
  speed: number;
  direction: PlayerDirection;
  _currentDirection: PlayerDirection;
  _bounced: boolean;
  _enteredBounds: boolean;
  bounds: [number, number];
  bounce: boolean;
  looping: boolean;
  duration: number;
}

/**
 * Creates a copy of the provided timer, but updated with the new timestamp.
 * @param timer - the timer to be updated
 * @param stamp - the new timestamp in milliseconds
 * @returns the updated timer
 */
export function reset(player: Player, stamp?: number): Player {
  const p = { ...player };
  const nowVal = now();
  p._currentTime = nowVal;
  p._previousTime = nowVal;
  p.stamp = stamp ? stamp : 0;
  p._currentDirection = p.direction;
  p._bounced = false;
  p._enteredBounds = false;
  return p;
}

/**
 * Returns the current time in milliseconds.
 * @returns the current time in milliseconds
 */
export function now(): RawTime {
  return (typeof performance === "undefined" ? Date : performance).now();
}

/**
 * Creates a copy of the provided timer, but updated with a new timestamp as determined by
 * the timestamp since it was last called and the duration of the animation itself.
 * @param timer - the timer to be updated
 * @returns the updated timer
 */
export function updated(player: Player, coldStart: boolean): Player {
  const p = { ...player };
  const duration = p.duration;

  const t = now();
  p._previousTime = coldStart ? t : p._currentTime;
  p._currentTime = t;

  const currentInBounds = p.stamp >= p.bounds[0] && p.stamp <= p.bounds[1];

  // Check if player has entered the specified bounds
  if (currentInBounds && !p._enteredBounds) {
    p._enteredBounds = true;
  }

  // Calculate effective timescale from speed and current direction
  const effectiveTimescale = p.speed * (p._currentDirection === PlayerDirection.Forward ? 1 : -1);

  // Compute the time delta in ms, multiplied by the effective speed.
  // In v2 format, stamp is in ms — no normalization by duration needed.
  const delta = (p._currentTime - p._previousTime) * effectiveTimescale;

  // Apply the time delta
  const updatedStamp = p.stamp + delta;

  // Use full range [0, duration] as bounds when outside specified bounds and haven't entered them yet
  // Otherwise use the actual bounds
  const [start, end] = !p._enteredBounds && !currentInBounds ? [0, duration] : p.bounds;

  // Check if player is moving toward the bounded region
  const movingTowardBounds =
    (p.stamp < start && p._currentDirection === PlayerDirection.Forward) ||
    (p.stamp > end && p._currentDirection === PlayerDirection.Reverse);

  // Apply boundary logic when crossing boundaries, unless moving toward bounds from outside
  if (updatedStamp > end) {
    if (movingTowardBounds) {
      // Player is outside bounds moving toward them - allow natural movement
      p.stamp = updatedStamp;
    } else {
      // Player is crossing out of bounds or moving further away - apply boundary logic
      if (p.bounce && (p.looping || !p._bounced)) {
        // Bounce: reverse current direction and clamp to boundary
        p.stamp = end;
        p._currentDirection =
          p._currentDirection === PlayerDirection.Forward
            ? PlayerDirection.Reverse
            : PlayerDirection.Forward;
        p._bounced = true;
      } else if (p.looping) {
        // Loop without bounce: return to start
        p.stamp = start;
      } else {
        // No loop, no bounce: stop at boundary
        p.stamp = end;
        p.running = false;
      }
    }
  } else if (updatedStamp < start) {
    if (movingTowardBounds) {
      // Player is outside bounds moving toward them - allow natural movement
      p.stamp = updatedStamp;
    } else {
      // Player is crossing out of bounds or moving further away - apply boundary logic
      if (p.bounce && (p.looping || !p._bounced)) {
        // Bounce: reverse current direction and clamp to boundary
        p.stamp = start;
        p._currentDirection =
          p._currentDirection === PlayerDirection.Forward
            ? PlayerDirection.Reverse
            : PlayerDirection.Forward;
        p._bounced = true;
      } else if (p.looping) {
        // Loop without bounce: return to end
        p.stamp = end;
      } else {
        // No loop, no bounce: stop at boundary
        p.stamp = start;
        p.running = false;
      }
    }
  } else {
    // Normal movement within or entering bounds
    p.stamp = updatedStamp;
  }

  return p;
}

/**
 * Sets the bounds for the player.
 * @param player - the player to be updated
 * @param bounds - the new bounds in milliseconds [start, end]
 * @returns the updated player
 */
export function withBounds(player: Player, bounds: [number, number]): Player {
  const p = { ...player };
  p.bounds = bounds;
  return p;
}

/**
 * Creates a copy of the provided timer, but updated with speed and direction.
 * @param timer - the timer to be updated
 * @param speed - the speed of playback desired (defaults to current speed)
 * @param direction - the direction of playback desired (defaults to current direction)
 * @returns the updated timer
 */
export function play(
  player: Player,
  speed?: number,
  direction?: PlayerDirection.Forward | PlayerDirection.Reverse,
): Player {
  const p = { ...player };
  p.running = true;
  if (speed !== undefined) p.speed = Math.abs(speed); // Ensure speed is positive
  if (direction !== undefined) {
    p.direction = direction;
  }
  // Always reset current direction to match direction when starting playback
  p._currentDirection = p.direction;
  p._bounced = false; // Reset bounce state when starting
  p._enteredBounds = false; // Reset bounds entry state when starting

  // If not looping and not bouncing, reset stamp to the appropriate bound when starting
  if (!p.looping && !p.bounce) {
    if (p.direction === PlayerDirection.Forward && p.stamp === p.bounds[1]) {
      p.stamp = p.bounds[0];
    } else if (p.direction === PlayerDirection.Reverse && p.stamp === p.bounds[0]) {
      p.stamp = p.bounds[1];
    }
  }

  // Only jump to opposite boundary if we're AT a boundary that blocks further progress in the current direction
  // This allows playing from outside bounds toward the bounds naturally
  const tolerance = 1; // 1ms tolerance for floating point comparison

  // If going forward and we're exactly at the end boundary, jump to start
  if (
    p._currentDirection === PlayerDirection.Forward &&
    Math.abs(p.stamp - p.bounds[1]) <= tolerance
  ) {
    p.stamp = p.bounds[0];
  }
  // If going reverse and we're exactly at the start boundary, jump to end
  else if (
    p._currentDirection === PlayerDirection.Reverse &&
    Math.abs(p.stamp - p.bounds[0]) <= tolerance
  ) {
    p.stamp = p.bounds[1];
  }
  // Otherwise, don't jump - let it play naturally from current position toward/through bounds

  return p;
}

/**
 * Creates a copy of the provided timer, but paused
 * @param timer - the timer to be updated
 * @returns the updated timer
 */
export function pause(player: Player): Player {
  const p = { ...player };
  p.running = false;

  return p;
}

/**
 * Returns the provided player, reset to the given stamp.
 * Pure stamp-set; viewport-follow is handled separately by the
 * viewport-follow subscription.
 * @param player - the player to be updated
 * @param stamp - the new stamp
 * @returns the updated player
 */
export function seek(player: Player, stamp: number): Player {
  return reset(player, stamp);
}

/**
 * Returns the provided player, with the duration set to the provided value.
 * @param player - the player to be updated
 * @param duration - the new duration
 * @returns the updated player
 */
export function withDuration(player: Player, duration: number): Player {
  const p = { ...player };
  p.duration = duration;
  return p;
}

/**
 * Creates a new Player instance with default values.
 *
 * @returns A new Player instance initialized with:
 * - Not running
 * - Current timestamp
 * - Zero stamp position (0ms)
 * - Normal speed (1x)
 * - Forward direction
 * - Default bounds [0, 5000] ms
 * - Looping enabled, bounce disabled
 * - 5000ms duration
 */
export function newPlayer(): Player {
  return {
    running: false,
    _previousTime: now(),
    _currentTime: now(),
    stamp: 0,
    speed: 1,
    direction: PlayerDirection.Forward,
    _currentDirection: PlayerDirection.Forward,
    _bounced: false,
    _enteredBounds: false,
    bounds: [0, 5000],
    bounce: false,
    looping: true,
    duration: 5000,
  };
}

/**
 * Sets the playback speed without affecting direction.
 * @param player - the player to be updated
 * @param speed - the new speed (must be positive)
 * @returns the updated player
 */
export function withSpeed(player: Player, speed: number): Player {
  const p = { ...player };
  if (speed < 0) {
    // If speed is negative, throw an error
    throw new Error("Speed must be a positive number.");
  }
  p.speed = speed;
  return p;
}

/**
 * Sets the playback direction without affecting speed.
 * @param player - the player to be updated
 * @param direction - the new direction
 * @returns the updated player
 */
export function withDirection(
  player: Player,
  direction: PlayerDirection.Forward | PlayerDirection.Reverse,
): Player {
  const p = { ...player };
  p.direction = direction;
  p._currentDirection = direction; // Also update current direction
  p._bounced = false; // Reset bounce state when direction changes
  p._enteredBounds = false; // Reset bounds entry state when direction changes
  return p;
}

/**
 * Reverses the current playback direction.
 * @param player - the player to be updated
 * @returns the updated player
 */
export function reversed(player: Player): Player {
  const p = { ...player };
  const newDirection =
    p.direction === PlayerDirection.Forward ? PlayerDirection.Reverse : PlayerDirection.Forward;
  p.direction = newDirection;
  p._currentDirection = newDirection;
  p._bounced = false; // Reset bounce state when direction changes
  p._enteredBounds = false; // Reset bounds entry state when direction changes
  return p;
}

/**
 * Sets the bounce behavior for the player.
 * @param player - the player to be updated
 * @param bounce - whether to bounce at boundaries
 * @returns the updated player
 */
export function withBounce(player: Player, bounce: boolean): Player {
  const p = { ...player };
  p.bounce = bounce;
  return p;
}

/**
 * Sets the looping behavior for the player.
 * @param player - the player to be updated
 * @param looping - whether to loop at boundaries
 * @returns the updated player
 */
export function withLooping(player: Player, looping: boolean): Player {
  const p = { ...player };
  p.looping = looping;
  return p;
}
