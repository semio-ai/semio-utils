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

## Development

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

Semio Studio mounts this repository as a git submodule at `packages/utils` and develops it
from source there.

A changeset for this library belongs in this repository's `.changeset/`. Inside Studio's
mount, the changesets CLI resolves to Studio's workspace root and writes into Studio's
`.changeset/` instead, which Studio's CI rejects. There, write the file by hand under
`packages/utils/.changeset/`, or run `npx changeset` from a standalone clone.

## Releasing

Add a changeset for each pull request that changes the published package. Changesets opens
a Version Packages PR for the next version. Staging does not wait for that PR: every main
run stages the current version when npm has not published it and neither `staged/v<version>`
nor `v<version>` exists on origin, even with pending changesets.

The build uses the version commit: the latest first-parent commit on main changing the
`package.json` version line, whose version must match the current version. A merge commit
merging a Version PR counts as that commit. Its own worktree and `npm ci` keep later code
and Changesets branch handling out of the build. Successful staging creates an annotated
`staged/v<version>` there. A maintainer approves it with 2FA on npmjs.com → package → Staged
Packages, or with `npm stage approve <id>`. The next run validates each marker's ancestry
on main and package version, tags `v<version>` at its commit after npm reports publication,
and deletes the marker. An unapproved annotated marker older than seven days warns with
approval or cleanup instructions. A published current version missing both tags gets its
`v<version>` at the version commit, including when the marker push failed.

Runs happen daily, on main pushes, or by manual dispatch on main. GitHub disables public
schedules after 60 days without activity; after that, use a main push or dispatch.

A rejected version may not be stageable again under the same number; npm's documentation
does not say. Restage by bumping the version with another changeset, and delete the rejected
version's `staged/v<version>` tag from origin.

## License

Apache-2.0
