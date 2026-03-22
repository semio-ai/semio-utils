import type { OrthographicCamera, PerspectiveCamera } from "three";

/**
 * Type guard for Three.js OrthographicCamera.
 *
 * Accepts a broad parameter type to work with both Three.js Camera and
 * R3F's Camera union (which may resolve from a different @types/three
 * declaration in monorepo setups).
 */
export function isOrthographicCamera(camera: object): camera is OrthographicCamera {
  return "isOrthographicCamera" in camera;
}

/**
 * Type guard for Three.js PerspectiveCamera.
 *
 * Accepts a broad parameter type to work with both Three.js Camera and
 * R3F's Camera union (which may resolve from a different @types/three
 * declaration in monorepo setups).
 */
export function isPerspectiveCamera(camera: object): camera is PerspectiveCamera {
  return "isPerspectiveCamera" in camera;
}
