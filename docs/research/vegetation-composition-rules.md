# Vegetation composition & anchoring rules (mined)

**Phase 10, 2026-08-31.** Follow-up to
[shipped-world-placement-rules.md](shipped-world-placement-rules.md) (R1–R5)
and [mod-vegetation-micro-siting.md](mod-vegetation-micro-siting.md), prompted
by owner playtest findings: floating hanging-vines, a waist-height floating
leaf-whorl "add-on", and trees "on tiptoes". This mines *how the source
authors compose models together and anchor them to the ground*.

- Machine-readable: [`world/sources/placement/composition-rules.json`](../../world/sources/placement/composition-rules.json)
  (classifies every species in `world/sources/flora/palettes.json`)
- Method: per-instance pivot-Z minus terrain-Z, plus nearest-neighbour
  co-occurrence within 2–8 m, over every BM&V placed reference
  (`worldgen.mine_placement.collect`; Black Marsh 144k refs, Valenwood 42k).

## C1 — The anchor is the pivot, never the bounding-box minimum

This is the root cause of "trees on tiptoes". Source models routinely carry
geometry *below* the authored pivot — hanging fronds, roots, kelp stalks:

| Model | bbox min-Z (below pivot) | placed pivot vs terrain, p50 |
|---|---|---|
| `treewillow01a` | **−4.05 m** | **0.00 m** (exact snap) |
| `treewillow02a` | −2.92 m | 0.00 m |
| `mangrovereachtree0gkb3` | −2.03 m | +1.82 m (stilt roots at waterline) |
| `cypress1` | −0.94 m | −0.8 to −2.1 m |
| `gkblillipad2` | −2.33 m (pivot at TOP) | +1.19 m (= water surface) |

The willows are decisive: if authors anchored by bbox-min, offsets would
cluster at +3/+4 m; instead they snap the pivot to terrain and let 4 m of
frond geometry pass through the ground. **Rule: snap pivot to terrain, sink
by class (C2), ignore bbox entirely.** Our renderer's bbox-min anchoring must
go.

## C2 — Sink depths: 0.2–0.8 m flat, ~2× on slopes

Pivot-below-terrain (Valenwood is the clean signal — real slopes, dry ground;
Black Marsh medians are diluted by wetland sinking and cliff dressing):

| Class (Valenwood) | flat <10° p50 | 10–25° p50 | ≥25° p50 | p25 flat |
|---|---|---|---|---|
| tree | **−0.79 m** | −1.42 m | −1.17 m | −2.16 m |
| shrub | −0.13 m | −1.42 m | −1.82 m | −2.35 m |
| plant | 0.00 m | −0.14 m | — | −0.25 m |

Per-species, flat → sloped p50: cypress1 −1.24 → −2.07 m; tropicalplant01
−1.77 → −2.71 m; bamboo −1.39 → −2.43 m; dwarfjunip05 −2.39 → −2.77 m.
Black Marsh flat swamp sinks less (tree p50 −0.23 m) but adds *waterline*
sinking: reeds 59 %, fernlarge 72 %, bigshrub 65 % of instances have pivot
below terrain — soft-mud burial is part of the swamp look.

> **Rule.** sink = base(class) + slope term: trees ~0.5 m flat +
> ~0.05 m/deg over 10°, shrubs 0.3 m + 0.07 m/deg, plants ~0.05 m, capped
> ~2–2.5 m; jitter ±50 % to reproduce the observed spread.

## C3 — Hanging/dangling pieces are attachments, and two of ours are stacked at dist 0

The dangling-root statics BM&V *does* place show the composition pattern:

- **`tramaroot01`** (in our palette): 399/400 sampled instances have a large
  plant within 8 m; the top host, `tropicalplant01`, sits at **horizontal
  distance p50 = 0.00 m** — the root piece is placed at the *same XY* as the
  bush/tree, pivot **+2.35 m** above the host's pivot and 0.4–5.2 m above
  terrain. It is literally composed into the plant.
- **`tramaroot06`**: pivot 4.3–9.9 m above terrain, hung on cliff faces
  (slope p95 44°), sitting dz +4 to +13 m above the ground plants below it;
  when tree-hung, again co-located at dist 0 with `tropicalplant01`.

The pieces the owner saw floating — `hangingvines1/2`,
`florahangingmoss02aaa/03aaa`, `moss_rockcliff01` — are **never placed at all
in BM&V or Valenwood (zero references)**. They are unused meshes in the mod;
there is no authored evidence for scattering them standalone, and our doing
so is exactly why they float. Vanilla's convention for FloraHangingMoss (the
same mesh family) is attachment to tree limbs. **Rule: these species are
`attachment`-class only — spawn them as children of a placed tree, pivot
2–6 m up the trunk/canopy, or on cliff faces ≥25°; never as free scatter.**

## C4 — Bush clusters are composed sets, not lone shrubs

Every mid-storey plant in our palette is placed in tight mixed stacks in
Black Marsh — fraction of instances with a *different* species within 2 m:

| Species | frac | top companions |
|---|---|---|
| tropicalplant01, tropicalshrub01 | 1.00 | esloebush08, braken, bigshrub2 |
| esloebush08 | 0.997 | fernlarge03, braken |
| braken | 0.993 | esloebush08, chickweed |
| bigshrub2(colorful) | 0.987 | esloebush08, fernlarge03 |
| fernlarge03 | 0.933 | esloebush08 (sunk p50 −1.56 m — only fronds show) |
| chickweed | 0.80 | mangrove gkb9, tropicalshrub01 |

The waist-height "leaf-whorl" read comes from a cluster-part member placed
alone and unsunk. **Rule: these species spawn only as members of a 2–6-piece
mixed clump (companion sets above), members 0–2 m apart, deep-sunk (0.5–1.6 m)
so they interpenetrate into one bush mass.** (Curio: BM&V hides a trap
pressure plate under many harvest clusters — a gameplay composite, not flora.)

## C5 — Water column is layered: bed plants below, pads at the surface

`gkblillipad2`'s pivot is at the model *top*; authors place it at **water
level** (p50 +1.19 m above the submerged bed), not on terrain — anchoring it
to terrain drowns or floats it. Around it, at dz 0.00 within ~3 m:
`waterkelptall01`/`waterkelpshort01` (bed-anchored, reaching up);
`kelptallstatic01aaa` sits 1.4–1.9 m *below* neighbouring pads, on the bed.
Reeds (`vurt_reeds`) straddle the waterline, 59 % sunk into the mud.
**Rule: lilypads anchor to the water surface; kelp/algae anchor to the bed;
they co-spawn as one pool scene** (rings already mined in
mod-vegetation-micro-siting.md).

## Recommended compile_scatter implementation (brief)

1. **Anchoring**: switch from bbox-min to pivot; add per-class sink
   (C2 table, slope-scaled) with per-species overrides from the JSON.
2. **Species classes**: read `composition-rules.json` classes. `attachment`
   species leave the standalone scatter pools entirely; spawn them in a
   post-pass over already-placed trees/cliff cells (probability per host,
   offset = host XY ± small jitter, Z = host pivot + attachHeight sample).
3. **Cluster-parts**: spawn as clump *templates* (companion set + count 2–6 +
   radius 0–2 m + per-member sink), replacing their standalone entries —
   this also pushes Clark-Evans R toward the mined 0.5 (rule R1).
4. **Aquatics**: split anchors — water-surface (lilypad) vs bed (kelp); reuse
   hydrology water level already available to the compiler.
5. Flag list `neverPlacedAtAllBySources` in the JSON: those five meshes have
   no authored evidence; keep them attachment-only or drop them from
   palettes if the attachment pass is out of scope this round.
