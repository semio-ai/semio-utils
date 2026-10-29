# @semio/utils

Shared TypeScript utilities used across the Semio packages. Provides generic
math, color, results, serialization, React and Zustand helpers. Has no other
`@semio/*` dependencies, so it can be used on its own.

## Installation

```bash
npm install @semio/utils
```

Runtime dependencies include `color`, `deep-equal`, `react` and `zustand`.

## What's inside

| Area                        | Exports                                                                             | Notes                                                  |
| --------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Math / geometry**         | `angles`, `euler`, `pairwise`, `overlapping-segments`, `closestFrame`               | Generic geometry and frame calculations.               |
| **Color**                   | `colors`                                                                            | CSS color parsing, conversion and manipulation.        |
| **Results / progress**      | `Result`, `progress`                                                                | Typed operation results and progress helpers.          |
| **JSON / download**         | `json`, `download`, `regex`                                                         | Serialization, file downloads and regular expressions. |
| **React / Zustand helpers** | `useDeep`, Zustand types, `three-guards`                                            | Stable values, store types and camera type guards.     |
| **Canvas frameloop**        | `CanvasFrameloop`, `getCanvasFrameloop`, `setCanvasFrameloop`, `useCanvasFrameloop` | Shared canvas rendering mode.                          |
| **Unit display**            | `unitDisplay`                                                                       | Display conversions for stored units.                  |

Everything is re-exported from the package root.

## Usage

### Canvas render loop

`CanvasFrameloop`, `getCanvasFrameloop()`, `setCanvasFrameloop(mode)` and
`useCanvasFrameloop()` let a host select the render loop shared by
`@semio/scene` and `@semio/animation`. The default is
`CanvasFrameloop.Always` (`"always"`): every canvas renders every animation
frame. The setting is module-local, shared through this package, and does not
read browser globals or environment variables. Importing it starts no timers.

```ts
import { CanvasFrameloop, setCanvasFrameloop } from "@semio/utils";

setCanvasFrameloop(CanvasFrameloop.Demand);
// The host owns scheduling R3F's global invalidate() while demand mode is active.
// Restore continuous rendering when that host-owned scheduler stops:
setCanvasFrameloop(CanvasFrameloop.Always);
```

Each canvas subscribes outside its R3F root, so the setting applies both when
canvases mount and when the host changes it. Hosts must use the same instance
of `@semio/utils` as their scene and animation packages. Demand mode requires
host-scheduled invalidations because both packages have behavior that runs
without user input. The setting controls canvas rendering, not the player
clock, application state, or browser animation frames.

## License

Apache-2.0
