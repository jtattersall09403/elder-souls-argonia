# Vegetation renderer (Phase 10)

Draws the scatter compiler's output. Three files, one job each:

| File | Job |
|---|---|
| `vegetationBundle.ts` | decodes `chunk_<cx>_<cz>_vegetation.bin` — 16 bytes per instance, written by `worldgen/scatter.py` |
| `floraKit.ts` | indexes the compiled kit GLB (`public/kits/flora-province-v1.glb`) by semantic asset id, with its LOD chain |
| `Vegetation.tsx` | streams chunk bundles around the focus and draws them as instanced meshes |

## What is here and what is not

Module 65 §110 specifies four tiers. This is **T1 and T2** on plain
`THREE.InstancedMesh`: enough to see the world dressed and to measure it.
**T3** (runtime groundcover ring from `world/sources/flora/groundcover.json`)
and **T4** (impostors beyond the instanced range) are not built. Nor is wind —
that block belongs to the weather system (module 55 §98) and wiring it while
Phase 8c is in flight would collide.

Plain `InstancedMesh` is deliberate, not a shortcut: it is what any instancing
wrapper is built on, adds no dependency to pin, and is the honest baseline the
budget probe should measure before `@three.ez/instanced-mesh` or impostors are
justified by evidence rather than in advance.

## Two traps, both already sprung

- **Never look a kit asset up by its glTF node name.** three.js sanitises node
  names for animation property paths and strips the slashes out of
  `bmv__landscape/trees/cypress1`. The whole kit rendered empty and silently:
  every lookup missed, no error anywhere. The id travels in glTF `extras`
  instead (`export_extras=True` in the kit builder), and the LOD level with it.
- **One instanced mesh per chunk is a draw call per chunk.** Buckets are keyed
  by (species, LOD level) across every loaded chunk: 449 draws became 96 for
  the same 43,536 instances.

## Measuring it

```bash
cd apps/world-studio && npm run build
cd ../combat-sandbox && node ../world-studio/scripts/probe-vegetation.mjs
```

Boots the built studio over the five areas decision 0036 Q3 signed off,
screenshots each and reads `window.__STUDIO_VEGETATION_DEBUG__`
(`{chunks, instances, draws, triangles}`). Artifacts land in
`apps/world-studio/artifacts/`. Note the probe passes `--base` to
`vite preview`: preview runs with `command === "serve"`, so the build-time
base is not applied and the built `index.html`'s absolute asset paths 404
without it.

## Coverage

Only the exemplar and contrast areas are compiled
(`public/province/vegetation/`, 42 chunks) — the rest of the province has no
bundles and renders bare, which is the exemplar-first rollout working as
intended (module 95 §85.4). Province-wide fill is Phase 15.
