/**
 * Snaps a timestamp in milliseconds to the nearest frame boundary.
 *
 * @param stampMs - The timestamp in milliseconds.
 * @param framerate - The framerate (frames per second).
 * @returns The timestamp snapped to the nearest frame boundary in milliseconds.
 */
function closestFrame(stampMs: number, framerate: number): number {
  if (framerate <= 0) return stampMs;
  const frameDurationMs = 1000 / framerate;
  const frameIdx = Math.round(stampMs / frameDurationMs);
  return frameIdx * frameDurationMs;
}

export { closestFrame };
