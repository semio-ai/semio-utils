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

## License

MIT

### Error reports and Result

`DiagnosticError` is a transport-neutral object with `message`, optional `kind`,
`code`, `status`, `causes`, `stack` and `backtrace`. Rust adapters can emit this
shape as serialized data; no JavaScript Error instance is required. The enclosing
`ErrorReport` has `schemaVersion: 1`, a timestamp, and allowlisted UI context.

Keep domain operations typed as `Result<T, E>`. At a presentation boundary use
`result.mapErr(toDiagnosticError)` or normalize the error within `result.match`.
`createErrorReport` adds context, and `formatErrorReport` provides the same JSON
for technical details or a toast's `clipboardContent`. Reporting does not unwrap
success values or convert failures into exceptions. Exception boundaries use the
same adapter for unexpected runtime failures.

The adapter bounds individual strings, total diagnostic text (65,536 characters), and causes, omits arbitrary payload fields, and redacts
HTTP(S) and WebSocket URL credentials/queries/fragments and common credential assignments. Callers must
still omit sensitive free-form content; this is not a general-purpose secret scanner.
