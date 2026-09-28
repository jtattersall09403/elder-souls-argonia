# 0052 — A published settlement bundle obeys every contract the runtime enforces

Date: 2026-09-09. Status: accepted. Extends
[0041](0041-phase11-settlement-decisions.md) (placement) and the export half of
module 90.

## Context

The first build in which settlements were meant to stand drew none of them.
Two independent failures, both inside `SettlementLayer`, both invisible to
every offline check:

1. **At Lilmoth**, the collision-residency budget refused. Residency is by
   authored boundary, never by distance (`collisionResidency.ts`), so standing
   inside Lilmoth makes all 466 of its placements resident. Their solids need
   **1033** collision parts. `lod.colliderPartBudget` was **256** — a bare
   literal in `export_settlement_bundle.py` that had never been calibrated
   against a real settlement, because no settlement had ever rendered.
   The layer refused to draw anything and raised its fatal sentinel.
2. **At Mazzatun**, `validateLodTriangles` threw: the asset it was about to
   draw had a two-tier LOD chain, not three. The throw was uncaught, so it
   unmounted the React subtree the layer lives in — taking the studio's entire
   HUD with it, including the BP-markers checkbox the owner reported missing.

Both are the same *class* of defect: a hard runtime contract, enforced only
when the player happens to be at one position, with nothing offline able to
predict it.

## The calls

**1. The collider part budget is measured, not guessed.** `COLLIDER_PART_BUDGET
= 1600`, ~1.55x the measured worst case (Lilmoth, 1033 parts; Mazzatun 51,
Nine-Trunks 48, Wamasu Pond 28, Sap-Tapping 2). Parts are counted the way
`solidFrom` counts them: the measured manifest proxy where an asset has one,
otherwise the asset's LOD0 mesh primitive count read from the built GLB — a
placement is not one part. The derivation lives beside the constant, so the
next agent who has to move it knows what it was fitted to.

**2. Every runtime contract gets an export gate that reads the shipped
artefact.** `export_settlement_bundle` now refuses to publish when:

| Gate | Runtime counterpart |
|---|---|
| `collider_budget_errors` | the residency refusal in `SettlementLayer` |
| `lod_contract_errors` | `validateLodTriangles` |
| `texture_cap_errors` | `validateMaterialTextureCap` |

Each reads the GLB that will actually ship — LOD tiers and triangle counts from
the mesh graph, image dimensions from the PNG/JPEG header — never a manifest's
claim about itself, for the same reason the runtime measures the decoded
texture rather than trusting the manifest. All three sit under the owner's
`--ship-with-errors` override like every other error, and the runtime refusals
stay as backstops.

**3. Only assets that can satisfy the contract are placeable.** The root cause
of (2) was `KitShelf.locate` in `compile_settlement.py` scanning kits
alphabetically across *every* built manifest, so the throwaway sourcing probes
`probe-enclosure` and `probe-gapfill` — explicitly "Not a shipping kit", built
with a single `lodRatio` and therefore a two-tier chain — beat `settlement-mud-v1`,
`settlement-root-v1` and `underwater-v1` to assets those shipping kits also
hold. `KitShelf` now offers for placement only assets with at least two
`lodRatios`, keyed to the contract itself rather than to a `probe-` naming
convention. `by_asset` stays complete: it is measurement (canopy heights,
sizes), and a probe kit is a legitimate measurement source.

No asset was rebuilt and no contract was relaxed: every affected piece already
existed in a shipping kit with a valid three-tier chain (fence 1084/382/304,
Anvil root 1494/522/300, totem02 4974/1739/595).

**4. The settlement layer's own failures stay inside the settlement layer.**
The scene-build effect is wrapped, so any throw becomes the layer's
`fatalError` sentinel instead of unmounting the host's React tree. A settlement
that cannot draw is a visible refusal, never a blank application.

## What this does not cover

`SettlementLayer`'s bundle-load and kit-GLB-load fatals remain runtime-only,
and correctly so: they are transport failures, not data defects. The
"references missing kit" fatal is impossible by construction — `bundle.kits` is
built from the placed kit set. A GLB that is present, non-empty and *corrupt*
would still only fail in the browser; `_stage_assets` checks existence and size,
not integrity. Queued in `docs/phases/P-polish/backlog.md`.

## Addendum 2026-09-28 — refusals are readable and gated before deploy (16k walk 3)

**Three incidents, one shared cause.** 2026-09-09 Lilmoth (collider budget)
and Mazzatun (two-tier LOD chain) above, then 16k walk 3: every deployed
place drew nothing. `tooling/pages-site/compose.mjs` pruned `kits/works-v1-fx/`
because it derived a kit id from each folder name and kept only ids a shipped
text file named as `kits/<id>`; the works-v1 manifest names the folder only by a
path relative to itself (`effectTextures`). The deployed flame texture 404'd,
the layer turned that into `fatalError`, and the fatal was drawn as a magenta
wireframe octahedron at the player. Each time a load refusal was shown as a
shape nobody could read and nothing had run the refusal before deploy.

**What changed.**
1. Compose keeps kit files by resolved reference, never by folder name
   (`tooling/pages-site/kit-reach.mjs`, unit-tested with a sidecar `-fx`
   fixture): the named kits' files, then every file their JSON resolves to,
   to a fixpoint. It then refuses to ship any dangling reference (a kit
   manifest's relative asset path, any live record's `kits/…` string).
2. Preflight gate `site-refs` (`tooling/repo-standards/check_site_refs.mjs`)
   runs that reach and gate over the sources in under a second, no build.
3. Preflight gate `bundle-load` (`packages/game-core/src/settlement/publishedLoad.test.ts`,
   also in `npm test`): every published bundle through the runtime's own
   file-decidable refusals (schema, collision frame, kit files, manifest
   parse, asset rows, LOD tier count, flame and smoke texture files);
   path-selected on the bundles, the kits and the settlement runtime.
4. The fatal draws nothing (fail-closed stands) and is reported through the
   layer's injected `onError` (the studio HUD's red "SETTLEMENT LAYER
   FAILED: …" line) and `console.error`. §4's shape sentinel is retired.
5. A flame or smoke sprite that fails to load is not a refusal: the places
   draw without it and the HUD line says so (`fatal: false`).

