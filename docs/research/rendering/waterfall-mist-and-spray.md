# Waterfall mist and spray — one version of the truth (2026-09-14, decision 0064)

Consolidates [waterfalls-realtime §1.4/§2.5](waterfalls-realtime.md), the
[vault audit §2.3 / §7(c)(e)](waterfall-assets-vault-audit.md) and the
fog/weather research in this folder
([natural-light-sky-atmosphere §2.4](natural-light-sky-atmosphere-threejs.md),
[weather-clouds-rain](weather-clouds-rain-threejs.md)). It resolves the
contradictions between them. The owner's ask (2026-09-14, gorge fall
`?view=character&x=2.53&z=0.32`): "there is no mist that I can detect". He asked for "more
than one kind of mist: mist and particle effects that follow the
volume of the fall, fanning out as you go down, like spray coming off the
falling water; a cloud of mist at the base over the plunge pool; and particle
effects for the splashing water as it lands in the pool."

## 1. What the sources say, and where they disagreed

| Source | Claim | Status |
|---|---|---|
| waterfalls-realtime §1.4 (RTVFX, Taiji, Floggins) | mist hides the join; soft particles; base = big shrinking rings + small droplets killed at a plane; bake lighting into the mist texture | kept: soft depth on every mist piece; the ring piece; lighting is the shared falls irradiance, not per-particle |
| waterfalls-realtime §2.5 (Bethesda budgets) | 1–2 emitters per piece, ≤ 4 for a hero splash; "the bulk of the base read is a dozen flat quads" | **superseded in part**: the read is the KIT (skirt, ring, mist cards, ground mist), not our own flat quads; the emitter counts were the reason the owner saw no spray, so the particle kit is now one emitter per ~6 m of drop |
| vault audit §2.3 | mist is geometry: `fxwaterfallmistblastlite` cards (254 placements, scale 0.08–2.02, median 0.51), `fxmistlow01` discs (10–40 per basin, scale 0.2–5.3), the skirt's fog planes; "individually cheap and numerous — that is the whole trick"; it is geometry, never a particle system | kept verbatim: the stack places 4–8 cards within 12 m and 10–40 discs over the bowl (`WaterfallKitStack.ts`) |
| vault audit §7(c)(e) | card pitch −10° to 135°, random yaw; ground mist level, very slow drift +0.030 / −0.017 tiles/s | kept |
| natural-light §2.4, weather-clouds §1 | froxel volumetric fog: "quality-tier-only, after Tier 1"; later **cut** by the owner (2026-09-13, module 55: "the shipped mist, haze and fog are what we want; no heavier fog technique") | **not contradicted**: a per-fall local volume is a different thing (below) |
| 0047 addendum 2026-09-08 | "1 mist emitter per site (2 for a fall over 20 m)" | superseded by 0064 |

**The one contradiction that mattered.** The 2026-09-08 code took "particles
are the accent" to mean almost none (1–4 emitters at ~1 burst/s of
centimetre droplets) and took "mist is geometry" to mean a few faint cards
the owner could not see. Bethesda's numbers are the counts of *pieces*, not a
licence for invisibility: a Skyrim fall has its skirt fog, its vapour jets,
its mist blasts, 20 ground-mist discs AND a particle system per piece.

## 2. Why the weather's froxel cut does not apply here

Froxel fog (Wronski 2014) is a frustum-aligned 3D texture of the whole view,
lit per voxel and integrated per pixel: a scene-wide technique whose cost is
the whole screen at every quality tier, which is why module 55 ranked it high
tier only and the owner then cut it. A waterfall's mist is a **local**
volume: it exists in a box a few tens of metres across around one cascade,
there are 18 in the province, of which at most a couple are within range at
once.
Ray-marching that box directly (no 3D texture, no temporal reprojection) is
bounded by the box's screen area times a fixed step count. It is the
standard way games place a single volumetric effect
([Unreal's local fog volumes](https://dev.epicgames.com/documentation/en-us/unreal-engine/local-fog-volumes-in-unreal-engine)
are exactly this: an analytic density in a bounded proxy, marched per pixel).
So: the weather system's fog stays as shipped; each fall gets its own volume.

## 3. What is built (three kinds of mist, one of spray, one of splash)

All in `packages/game-core/src/water/render/`:

1. **Kit mist (geometry)** — `WaterfallKitStack.ts` places, per fall:
   the skirt's fog column and foam planes at the impact (`fxwaterfallskirt-
   tallfront`, textures `fxfogheavy` / `fxcloudroundtile*`), the body's two
   vapour jets on tall falls (`fxwaterfallbodytall02` `jet*`, `vaportile01`),
   4–8 `fxwaterfallmistblastlite` cards pitched −10° to 135° within 12 m of the
   impact, 10–40 `fxmistlow01` discs (`cloudtile`) over the bowl. Shaded by
   `WaterfallKitMaterial.ts` with the audit's rates, soft depth 1.07 m (cards,
   skirt) / 0.60 m (ground mist), emissive grey 0.70–0.78 × 0.75.
2. **The mist volume (ray-marched)** — `WaterfallMistVolume.ts`. One
   InstancedMesh of world-aligned unit boxes, one per fall (back faces, so the
   camera may stand inside). Per pixel: slab-intersect the box, clamp the far
   end to the scene depth along the ray, march `MIST_STEPS` = 20 jittered
   steps. Density = **cone** (axis lip → plunge; radius 0.35 × width at the
   lip growing 0.11 m per metre fallen, capped 12 m; strength rising with the
   fraction fallen — "fanning out as you go down, like spray coming off the
   falling water") + **dome** (ellipsoid over the pool: radius 1.15 × the
   compiled bowl radius, height 0.22 × drop clamped 2–14 m — "a cloud of mist
   at the base over the plunge pool"), both × a two-octave value noise
   drifting up 0.8 m/s and downstream 0.6 m/s. Extinction 0.12 /m (cone,
   at the foot) and 0.22 /m (dome). Lighting: albedo 0.86 × the shared falls
   irradiance under the CSM shadow, × (0.6 + 2.4 · HG(g = 0.55) · sun
   visibility), so mist glows when the sun is behind it. Drawn within 120–
   150 m, never from under water. Cost: box screen area × 20 steps × 2 noise
   lookups; at the gorge base the box covers roughly a third of the frame.
3. **Spray particles** — `WaterCascadeSources.cascadePathEmitters`: one
   sheet-contact emitter every ~6 m of drop (max 10), rates 0.4 → 1.2 bursts/s
   from lip to foot × √(width/6), ~10 mist-heavy particles per burst (radius
   0.8 → 1.7 m, `mist` 0.9), most of them coherent `fallingSpray` droplets
   riding the lip → plunge trajectory; the lip emitter on falls ≥ 30 m; the
   plunge cloud at 3 bursts/s of ~17 particles with a 3 m radius. On the
   nearest two falls only (`CASCADE_PATH_LIMIT`).
4. **Splash** — `cascadeImpactBursts`: a discrete `splash` event at the
   plunge 2.5 times a second per fall, phased by id, with the impact speed
   √(2 g drop): `WaterEffects` spawns a crown ring (`WaterCrowns`) and thrown
   droplets from it — "particle effects for the splashing water as it lands".
5. **Foam** — unchanged: the plunge injects into the foam field, the field's
   own `esPlungeFoam` disc, plus the kit's ring piece (`fxrapidsringheavy`,
   counter-scrolling +0.375) on the pool.

## 4. Budgets and what a probe measures

- Particle pool 768 (high) / 256 (low): the two nearest hero falls emit
  ≈ 200 particles/s each at ~1.5 s lifetimes → ≈ 600 live; the test
  `WaterfallSheets.test.ts` "stays inside the particle pool" bounds this.
- Mist volume: 18 instances, 20 steps; `probe-water.mjs` records fps with
  and without the falls layer at every fall site.
- Piece counts per fall are in `__STUDIO_WATER_DEBUG__.falls.perFall[id].counts`.

## 5. What is not done, and why

- The mist volume is not shadowed by the fall itself (only by the scene's
  CSM); self-shadowing the volume would need a second march per step and is
  not worth it for a 20-step local volume.
- No wind coupling: the drift is a fixed up-and-downstream vector. The
  weather's wind is available (`runtime.windVelocity()`) and could bias the
  drift in a later pass; recorded here, not a holding position — the volume
  reads right without it and the owner's list did not ask for wind.
