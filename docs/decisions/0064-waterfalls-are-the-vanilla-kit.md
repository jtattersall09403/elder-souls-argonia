# 0064 — A waterfall is the vanilla FX kit, stacked Bethesda's way, shaded by us (Phase 16c round 2, 2026-09-14)

Supersedes the [0047](0047-water-one-physical-model.md) addendum
"vanilla waterfall assets: merge, do not mount" (2026-09-08) and
[waterfalls-realtime §4.1](../research/rendering/waterfalls-realtime.md)'s
"do not snap a Skyrim body NIF to the lip". Evidence for the ruling: the
owner's review of the gorge fall (`?view=character&x=2.53&z=0.32`): a
~2 m-wide opaque white curved strip standing in for an 8.7 m, 79 m fall, no
mist, no spray, a hard block above the lip, flat grey plunge quads on a
stair-stepped bowl.

**The owner's ruling (2026-09-14, verbatim where it matters).** "I made a
decision a while back that we would use and adapt Skyrim's actual waterfall
kits, not create custom odd looking ribbons of our own." The 0047 addendum
recorded the opposite ("Not as runtime meshes"; "As data, yes") after an
agent asked the owner; the owner's recollection and today's ruling differ
from it. Today's ruling stands.

**Decisions.**

1. **A waterfall is built from the vanilla Skyrim FX kit pieces**
   (`apps/world-studio/public/kits/waterfall-fx-v1.glb`, 26 assets, built
   from the vault by `tooling/asset-pipeline` with the config
   `pipeline/config/kits/waterfall-fx-v1.json`; textures ship separately as
   PNGs in `kits/waterfall-fx-textures/`), placed the way Bethesda placed
   them — the stacking rules mined from `Skyrim.esm` in the
   [vault audit §5](../research/rendering/waterfall-assets-vault-audit.md):
   bodies tile and stack with ⅔-height overlap and ½-width lateral spacing,
   **uniform scale only** (Bethesda's own range 0.35–2.28), the crest line
   (`fxrapidsfallsline01`) at the lip, the skirt (`fxwaterfallskirttallfront`)
   and the heavy ring (`fxrapidsringheavy`) at the plunge, 4–8 mist blast
   cards (`fxwaterfallmistblastlite`) within 12 m of the impact, 10–40
   ground-mist discs (`fxmistlow01`) over the plunge basin. Counts are
   derived from drop and width; the scale is uniform, always.
2. **"Adapt" means our shader and our placement logic on their geometry and
   textures.** One material family (`render/WaterfallKitMaterial.ts`)
   reproduces the UV-scroll controllers the glTF export drops (audit §4
   rates: −0.857 sheet / +0.030 U drift / 1.00↔1.05 breathe, −0.313 and
   −0.333 on the body shells, −0.5/−0.15/−0.075 on the crest, +0.375 on the
   ring, −0.158 on the mist card, +0.030/−0.017 on ground mist), alpha blend
   with depth-write off, double-sided, per-layer soft depth (0.57 m sheets,
   1.07 m spray, 0.60 m ground mist), the edge-on fade (cos 0.26 → 0.09),
   emissive grey 0.70 × 0.75 for mist and unit white at alpha 0.8 for
   whitewater — all lit by `uWaterSunLight` / `uWaterAmbient` through the
   same falls irradiance and exposure as the rest of the water, shadowed by
   the scene's CSM, faded to nothing from under water. A piece is never a
   foreign object because the light rig, haze, depth softness and clock are
   ours; only the silhouette and the texture are Bethesda's.
3. **The ballistic tracer stays as the spine.** `WaterfallSheets.ts` keeps
   `traceWaterfallSheet` / `traceCascades` / `alignCascadeToStrips` / the
   brink measurement / the fall-vs-ramp classification; it decides where the
   pieces go and how they lean (each body piece's down axis follows the
   chord of its span of the traced arc). It no longer draws the water. Ramps
   still come back as chute strips for the ES_STRIP ribbon.
4. **The procedural ribbon is deleted**, not kept as a fallback. What the kit
   cannot do and we still do ourselves: the *lip wrap* (no vanilla piece
   carries water over the crest edge; the crest line covers the join, its
   upstream half lying on the strip and its downstream half over the first
   body piece), ramps (chute strips), the per-fall **ray-marched mist volume**
   (`render/WaterfallMistVolume.ts` — a cone hugging the fall that fans
   downward plus a dome over the pool; Bethesda's mist is cards, ours adds
   the volume the owner asked for) and the spray / splash particles on the
   existing particle stack (`cascadePathEmitters`, `WaterEffects`,
   `WaterCrowns`) at budgets that are visible. The old flat plunge quads
   (`PlungeBase`) are gone: the ring piece and the field's own pool surface
   are the base read (the 16c round-2 compile un-stamps the plunge bowl from
   the owner mask so the pool surface draws).
5. **This satisfies "kits only combine pieces designed to combine"** (owner
   ruling 2026-09-04) because the plugin data proves these pieces were
   authored to stack: 7,263 placements, 389 same-family neighbour pairs of
   `fxwaterfallthin512x128` within 22 m, the canonical body→crest→skirt→
   ring→mist stack read off 161/52/69/74 co-placements (audit §5).
6. **The lip seam is a gate that can fail.** `WaterfallSheets.test.ts` "the
   lip seam" samples the built stack against the shipped `water-meta.json`:
   the top edge of the first body piece is at the strip's last station
   level within 0.25 m; the body's width at the lip is ≥ 0.8 × the
   cascade's `widthM` (the water's width at the lip, bankfull). On the
   pre-fix build the width check failed at 0.31 × (a 2.66 m contracted
   jet on an 8.7 m channel).
7. **Registry.** `worldgen/asset_taxonomy.py` admits the waterfall /
   rapids / mist FX meshes as content (`CONTENT_EFFECT_PREFIXES`,
   `is_non_content`); they keep the `effect` category and have registry rows,
   so `build_kit` resolves them and `check_credits` sees them. No new credit
   line: vanilla art the README already credits.

**Consequences.** Decision 0047's fall model (a cascade record with lip,
plunge, direction, width, drop, profile) is unchanged; only the renderer's
body changed. The Phase 10 scatter job "rocks tight against the sheet edges"
(backlog) still applies — the skirt hides the foot, not the sides.
