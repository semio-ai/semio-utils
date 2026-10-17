import { afterEach, expect, it, vi } from "vitest";
import { CanvasFrameloop, getCanvasFrameloop, setCanvasFrameloop } from "./canvas-frameloop";

afterEach(() => {
  setCanvasFrameloop(CanvasFrameloop.Always);
  vi.useRealTimers();
});

it("defaults to rendering every frame without starting a timer", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const settings = await import("./canvas-frameloop");
  expect(settings.getCanvasFrameloop()).toBe(CanvasFrameloop.Always);
  expect(vi.getTimerCount()).toBe(0);
});

it("lets the host select demand rendering and restore continuous rendering", () => {
  vi.useFakeTimers();
  setCanvasFrameloop(CanvasFrameloop.Demand);
  expect(getCanvasFrameloop()).toBe(CanvasFrameloop.Demand);
  setCanvasFrameloop(CanvasFrameloop.Always);
  expect(getCanvasFrameloop()).toBe(CanvasFrameloop.Always);
  expect(vi.getTimerCount()).toBe(0);
});
