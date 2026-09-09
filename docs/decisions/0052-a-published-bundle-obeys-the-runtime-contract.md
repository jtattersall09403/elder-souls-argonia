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
not integrity. Queued in `docs/polish-backlog.md`.
