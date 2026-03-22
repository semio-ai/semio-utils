import type { Camera, OrthographicCamera, PerspectiveCamera } from "three";

/** Type guard for Three.js OrthographicCamera. */
export function isOrthographicCamera(camera: Camera): camera is OrthographicCamera {
  return "isOrthographicCamera" in camera;
}

/** Type guard for Three.js PerspectiveCamera. */
export function isPerspectiveCamera(camera: Camera): camera is PerspectiveCamera {
  return "isPerspectiveCamera" in camera;
}
