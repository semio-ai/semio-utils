# @semio/utils

Shared TypeScript utilities used across the Semio packages. Provides the
animation **player**, the runtime **values store**, and a grab-bag of math,
color, time, and React helpers. Has no other `@semio/*` dependencies, so it can
be used on its own.

## Installation

```bash
npm install @semio/utils
```

Runtime peers you'll likely already have: `react`, `three`, `zustand`.

## What's inside

| Area | Exports | Notes |
| --- | --- | --- |
| **Playback** | `usePlayerStore`, `Player`, and the pure transport functions `play` / `pause` / `seek` / `reset` | `usePlayerStore` holds transport state under `s.player` (`stamp`, `running`, `duration` — all in **milliseconds**). The pure functions operate on a `Player` value; `seek(player, stamp)` is a pure stamp-set. |
| **Runtime values** | `useValuesStore`, `values-store` helpers | Single source of truth for the current value of every animatable. Read with the hook; write via `useValuesStore.getState().updateValues(map)`. |
| **Math / geometry** | `euler`, `angles`, `hexagon`, `points-to-path`, `overlapping-segments`, `closest-frame`, `progress` | Pure functions, no React. |
| **Color** | `colors` | Parsing, conversion, manipulation. |
| **React helpers** | `useDeep`, `useMediaQuery`, context providers | |
| **Misc** | `result`, `json`, `download`, `regex`, `time`, `lazy`, `pairwise`, `namespace`, `log` | |

Everything is re-exported from the package root:

```ts
import { usePlayerStore, useValuesStore, seek } from "@semio/utils";
```

## Usage

### Playback

```ts
import { usePlayerStore } from "@semio/utils";

// Read transport state in a component (state lives under `s.player`)
const stamp = usePlayerStore((s) => s.player.stamp); // milliseconds
const running = usePlayerStore((s) => s.player.running);

// Drive playback via store actions
usePlayerStore.getState().playPlayer();
usePlayerStore.getState().pausePlayer();
usePlayerStore.getState().resetPlayer(2500); // jump to t = 2500ms
```

The transport is also exposed as pure functions over a `Player` value, if you
want to manage the clock yourself rather than through the store:

```ts
import { seek, play, type Player } from "@semio/utils";

let player: Player = play(current);
player = seek(player, 2500); // pure stamp-set, returns a new Player
```

### Runtime values

```ts
import { useValuesStore } from "@semio/utils";

// Read in a component
const value = useValuesStore((s) => s.values.get("my.animatable.id"));

// Write imperatively (e.g. from a gizmo drag) — updateValues takes a Map
useValuesStore.getState().updateValues(new Map([["my.animatable.id", nextValue]]));
```

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

MIT
