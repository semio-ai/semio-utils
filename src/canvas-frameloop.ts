import { create } from "zustand";

/** Render loops supported by Semio's scene and animation canvases. */
export enum CanvasFrameloop {
  Always = "always",
  Demand = "demand",
}

const useCanvasRenderSettings = create(() => ({ frameloop: CanvasFrameloop.Always }));

/** Read the host's render loop. Importing this module does not start any timers. */
export function getCanvasFrameloop(): CanvasFrameloop {
  return useCanvasRenderSettings.getState().frameloop;
}

/**
 * Set the render loop for mounted and future Semio canvases in this module graph.
 * Demand mode requires the host to schedule R3F invalidations for continuous behavior.
 */
export function setCanvasFrameloop(frameloop: CanvasFrameloop): void {
  useCanvasRenderSettings.setState({ frameloop });
}

/** Subscribe outside the R3F canvas so changes also reach existing canvases. */
export function useCanvasFrameloop(): CanvasFrameloop {
  return useCanvasRenderSettings((state) => state.frameloop);
}
