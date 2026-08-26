# Third-party notices

Runtime npm dependencies used across this monorepo's apps and packages
(`apps/combat-sandbox`, `apps/world-studio`, `apps/game`, `packages/*`).
Dev-only tooling (build/test/lint) is excluded — this covers what ships in
the built game. Pointed to from the root [README](README.md) § Credits and
third-party sources (decision 0023).

| Package | License | Project |
| --- | --- | --- |
| `ecctrl` | MIT | https://github.com/pmndrs/ecctrl (copyright 2023–2026 Erdong Chen) |
| `three` | MIT | https://github.com/mrdoob/three.js |
| `react` / `react-dom` | MIT | https://github.com/facebook/react |
| `@react-three/fiber` | MIT | https://github.com/pmndrs/react-three-fiber |
| `@react-three/drei` | MIT | https://github.com/pmndrs/drei |
| `@react-three/rapier` | MIT | https://github.com/pmndrs/react-three-rapier |
| `@dimforge/rapier3d-compat` | Apache-2.0 | https://github.com/dimforge/rapier.js |
| `zustand` | MIT | https://github.com/pmndrs/zustand |

The full license text for each package ships inside its own npm package
(`node_modules/<package>/LICENSE`) and at the project URL above.

## Keeping this current

When you add a new runtime dependency to any `apps/*` or `packages/*`
`package.json`, add a row here in the same change — check the installed
package's `license` field / repo LICENSE rather than assuming MIT.
