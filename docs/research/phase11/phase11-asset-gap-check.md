# Phase 11 asset gap check — three owner questions

Research only, 2026-09-03. **Nothing downloaded, no catalogue file edited.**
Answers three questions raised at the Phase 11 touchpoint. Companions:
[settlement-asset-inventory.md](../placement-settlements/settlement-asset-inventory.md) (what we hold),
[settlement-kit-sourcing-log.md](../placement-settlements/settlement-kit-sourcing-log.md) (what 6b took
and rejected — read its skip table before proposing any download),
[mined-interior-assembly-and-settlement-form.md](../placement-settlements/mined-interior-assembly-and-settlement-form.md)
(measured assembly rules).

---

## 1. Dunmer / Velothi — do the north's asset plans resolve? **Yes. No gap.**

All 139 `places-dunmer-north` records were aggregated (36 distinct `assetPlan`
slugs, 693 slots). **Every slug resolves** through
`world/sources/catalogue/asset-aliases.json` to a family that exists in
`settlement-asset-inventory.json` — as does every slug in all eight regions
(3,738 slots, zero unresolved). `worldgen.catalogue --check` already enforces
this, so the aliases file is the guarantee, not a hope.

Top slugs in dunmer-north: `clutter` 131 · `stockade-scaffold` 54 ·
`totems-ritual` 46 · **`dunmer-telvanni` 43** · `mud-mother-grove` 43 ·
`landmark-civic` 41 · `fences-wattle` 40 · `vanilla-farmhouse` 36.

`dunmer-telvanni` → `arch.foreign.dunmer-velothi`: **288 pieces** in the BM&V
pool — Telvanni towers/pods/gourdhouse/gazebos/ramps/roots (31, mirrored under
`mushroomtower`), Phitt velothi + stronghold + daedric sets, Ashlander hut (17),
silt strider. Registry spot-check confirms the rows (e.g. `telvanni/tel_int_connector_01`
111 placements, `tel_ext_cap_03` 31×31×22 m, `phitt/stronghold/entrance` 36
placements). Status is **`have-unextracted`** — it sits inside `Data1.rar`
(1.3 GB, present on disk) and `RarSource` pulls members on demand in ~0.1 s, so
this is a build step, not a sourcing problem.

**The real Velothi risk is not availability, it's that no Dunmer kit has been
built.** Five kits exist (`settlement-mud/stilt/imperial-v1`,
`ruin-monumental-v1`, `underwater-v1`); there is **no `settlement-dunmer-v1`**,
so 43 north records currently point at a family with no compiled GLB. That is
the one actionable item here: a kit build, using the same `build_kit` path.

**Nexus candidates — recorded, not needed.** Note first that BM&V's
`architecture/phitt/*` **is** Phitt's Morrowind resource line, so we already own
the best-known source. If higher-fidelity Velothi is ever wanted:

| Candidate | Domain / ID | Note |
|---|---|---|
| Phitt's Morrowind Resources Remapped | SSE **107571** | Velothi exteriors + entrance + scaffolding + interior halls, remapped onto vanilla textures. **Likely a duplicate of what BM&V already bundles** — check before downloading |
| Velothi Tile Set Part 1 (Vohki) | classic **121551** | 39 models: small hall, small room + balcony, ash pits, ancestral-tomb entrance, Velothi furniture. Free use + conversion with credit — cleanest terms found |
| Daedric and Velothi Tilesets | classic **81079** | Phitt Sheogorad conversion; overlaps BM&V's `phitt/daedric` |
| Journey to Baan Malur and Morrowind | SSE **114518** | Morrowind-idiom asset aggregation, but asks you to pull meshes from the original pages — a bibliography, not a source |

Recommendation: **download nothing.** Build `settlement-dunmer-v1` from the BM&V
pool; keep 121551 as a fallback if fidelity disappoints on import.

---

## 2. `settlement-root-v1` — the grown-root interior kit. **Honestly: kitbash only.**

Verified current state: `asset-aliases.json` has **no `root-*` slug**, and the
inventory has **no root/grown-architecture family**. Decision 0041's finding
stands unchanged — nearest families are `bamboo-hut`, `hist-variants`,
`azura-tree`, `argonian-props`, with `mud-mother-grove` carried as a stopgap
even though it is the *Shadowfen* kit and the lore file explicitly forbids
wattle-and-daub inland. That is the one live lore/asset contradiction in the
catalogue.

**Can we build the look from what we own? Yes, as a kitbash — no single pool
expresses it.** Working parts, all in hand:

| Idiom element (material-culture.md) | Buildable from |
|---|---|
| Trained living root/limb as structure | `bmv:stroti/tree house` (3 pieces: house 13.2×11.8×5.2 m, roof, door) · `azura_tree02` (BM&V's most-placed static, 523 uses) · 84 registry rows in the `root` category (`tramaroot01` 2,585 placements, 3.2 m) massed as buttresses |
| Split root-wood decking, stairs, thresholds | `passerelles-walkway` (59 pieces, curving/climbing) · `stockade-scaffold` (72) |
| Bark shingle / layered frond roof (*not* reed thatch) | HTBM palm-thatch awnings + `bamboo-hut` roofs — **the weakest match; will read as thatch** |
| Withy/flint-vine lashing, sap sealing | `ArchwaySticks`, woven/snake fences (7), rope runs — dressing only |
| Chimes at every threshold | `ArgonianBoneChime01/02` (Mud Mother Grove) + `windchimehavok` (Skyfall) — **fully covered** |
| Hist/canopy presence | 2 hero Hist meshes + `histflower01/02` + Phase 10 flora kit |
| `/deeps` variant (cane, bog-oak, hide, bone) | 56 animal-bone rows, skeleton totems, hide tents, undressed Ayleid/xanmeer block |

**Do not use** `tel_ext_root_01/02` or the Telvanni pods, tempting as "grown
architecture": the two-culture rule confines them to Thorn and the Morrowind
border, and using them inland would blend cultures visibly.

**Kitbash plan (proposed, ~1 kit build):** `settlement-root-v1` =
Stroti treehouse shell + azura_tree/root-mass buttressing + passerelle decks and
stairs + bamboo/frond roofing + Argonian props, chimes and lights. Add the
matching alias slugs (`root-shell`, `root-decking`, `root-canopy-roof`) and
re-point the interior records off `mud-mother-grove`, which is the actual lore
defect to fix.

**Nexus search done — nothing worth buying.** Stroti's Treehouse Resource
(classic **62787** / SSE **2378**) is the only genuine treehouse modder's
resource, open permissions, and **we already hold it via BM&V**; the SE page is
worth a look only if BM&V's copy is missing pieces (rope ladder, clutter set).
Everything else returned is a finished player home with custom-mesh permissions
(Elisdriel 57371, Skaal Treehouse 30910, Falkreath 40741) — reference, not
source. No "grown/living architecture" kit exists on either domain. Treat
`settlement-root-v1` as **permanently kitbashed**, exactly as the mud culture is.

---

## 3. Assembly knowledge — enough to build exemplars. One decision outstanding.

**What we HAVE** (measured from 660 interiors / 3,425 buildings, not guessed —
digest in `mined-interior-assembly-and-settlement-form.md`, machine tables in
`world/sources/placement/bmv-interior-assembly.json`, `bmv-settlement-form.json`,
`bmv-valenwood-settlement-form.json`, `vanilla-tamriel-settlement-form.json`):

- **Snap:** module 128 units ≈ 1.82 m (kit pieces 3.64 m = two modules), with
  per-kit *lift over chance* — town interiors 14–23 (hard-snapped), dungeon kits
  2–5 (half), caves ~1 (free). One assembler cannot serve both.
- **The stronger rule than the grid:** 26 % of adjacent-piece axis offsets are
  exactly zero (62–74 % in town kits). Align pieces **to each other in a chain of
  local frames**, not to a world lattice — Creation Kit "snap to reference"
  behaviour.
- **Rotation:** yaw quantised to 90° (92–98 % in town kits); tilt 3–7 % built,
  40 %+ cave; 19 % of shell pieces uniformly rescaled.
- **Pivots:** kit pieces are **centre-pivoted**, so `vet_kit`'s ~30 "pivot above
  base" warnings are expected. The settlement compiler must place by grid
  transform, never via the flora bottom-anchor path (0041 Part 0).
- **Adjacency:** per-kit piece-pair table with modal join offsets `{planarM,
  riseM, n}` — sample from it directly.
- **Rooms:** p50 chamber 20.5 × 13.8 m. **Clutter density** per 100 m²: lived
  interiors 36–71, dungeons 4–13, Ayleid ruins 0.6 — a 10–20× lived:ruined ratio.
- **Settlement form:** building spacing **~15 m centre-to-centre** in all three
  worlds (culture-independent); median hamlet 5–9 buildings; Black Marsh median
  settlement radius 53 m, **3.9 m to water** vs Skyrim's 52 m; orientation
  coherence 0.75 vs 0.50. Site from hydrology first, roads after.

**What we DON'T have:**

1. **No facade-facing signal.** `facingVsWater/RoadBearing` both land at the
   uniform-random expectation — a ref's yaw is relative to each mesh's own
   authored front, so it is unmineable in principle. Phase 11 must **annotate a
   front vector on the ~20–30 meshes it actually uses**, or rule facing from its
   own composition rules. *This is the one outstanding decision before exemplars.*
2. **No shipped Argonian interior anywhere.** BM&V's 37 profiled interior shells
   are all vanilla kits; the Xanmeer tileset ships zero placed examples. Argonian
   interior grammar must be derived from mesh connect geometry + the vanilla
   grammar. Phase 12's problem, but exemplar interiors hit it first.
3. **No real ceiling clearance** (mined spread is of piece origins, not
   floor-to-ceiling) — needs a mesh-side NIF bounds pass in the asset pipeline
   before combat-space sizing (module 70 §49) is trusted.
4. **No room-function labels** — inferable from furniture mix, deliberately not
   attempted.
5. **Weak road data** in Black Marsh (755 samples / 8,344 cells) — use Skyrim's
   28.9 m road figure, not BM&V's 79.2 m.
6. **0.45 % length bias** in every mined number (`UNITS_PER_METRE` 70.303 vs
   70.0028). Immaterial for ratios; fix in one place and re-run all miners.

**Verdict: nothing more needs *sourcing* or *mining* before exemplar builds.**
The two jobs are internal: front-vector annotation on the used meshes, and a NIF
clearance pass if interiors are in the exemplar scope.
