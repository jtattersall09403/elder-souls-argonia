# Offshore islands: feasibility, realism and cost

Owner question (2026-09-03, Phase 11 touchpoint ② feedback): *"Should we have
more islands off the coasts? Only if we can implement them simply and
geographically realistically, to hold some interesting places."*

Answer in one line: **yes for estuary/lagoon/delta islets (option b) — they are
cheap, realistic and canon-supported; no for a barrier chain or a big offshore
island, which our bathymetry and the 2.9 km of sea we own cannot honestly
carry.** Do it as one deterministic sculpt step in `refine_province`, in the
Part 6 window, not now.

## 1. What the coast actually is (measured, not guessed)

Measured off the committed rasters (`province/refined/height-rg.png` +
`meta.json`, 2017² at 3.66 m/px; same numbers reproduce via
`worldgen.site_fields`).

| Fact | Value |
|---|---|
| Province extent | **7.37 × 7.37 km** (decision 0015, HSCALE = 1.0) |
| Sea (below 0 m) | 37% of the raster; ocean (border-connected) 36% |
| **Max open sea between shore and the province edge** | **2.93 km** (p95 2.05 km) |
| Median ocean depth | −34 m; only 28% of ocean is shallower than 10 m |
| Shelf width (shore → −10 m contour), median | north 389 m · **west 1707 m** · east 417 m · **south 646 m** |
| Existing separate landmasses touching ocean (>400 m²) | **59**, largest 39 ha, four in the 26–39 ha class |
| Places already plotted on a non-mainland landmass | **54 of 527** (plus 43 standing in water) |

Two consequences dominate everything below.

**(a) There is no continental shelf.** Off Lilmoth and Archon the sea floor is
already at −33 m and −44 m within 2 km of shore. That is a Bethesda bathtub, not
a tropical deltaic margin: the source esp drops the sea floor past the
coastline and never models a shelf. A barrier island or a drowned-ridge islet
out there would be a hill standing in 40 m of water with no geomorphic reason
to exist — the exact opposite of "realistic". To do it honestly you would have
to sculpt a **shelf first**, which is a much bigger, riskier terrain edit.

**(b) We only own 2.9 km of sea.** The province edges are closed playable edges
with a low-res apron beyond ([beyond-border-distant-lands.md](beyond-border-distant-lands.md)).
An island 1.5–2 km offshore sits within sight of the world edge and forces the
player to swim/sail toward the invisible wall — the single most immersion-
breaking place to put a destination.

**(c) The lagoons and estuaries are the opposite case.** Median water depth
within 2 km of Stormhold, Helstrom, Gideon and Alten Corimont is **−1 m**.
Shallow, sheltered, silt-laden water is exactly where real tropical coasts make
land: mangrove-colonised mud banks, mid-channel delta bars, cheniers, drowned
interfluves ([tropical-fluvial-geomorphology.md](tropical-fluvial-geomorphology.md),
[mangrove-coastal-ecology.md](mangrove-coastal-ecology.md)). Islets there are
free realism.

## 2. Lore: canon already asks for offshore islands

All from existing dossiers (UESP pages verified live via the API, 2026-09-03).

| Canon island | Where | Source |
|---|---|---|
| **Norg-Tzel** ("Forbidden Place") — cursed island holding a xanmeer, prison of the Golden Skull of Beela-Kaar | off the coast **SE of Lilmoth** | Lore:Norg-Tzel; dossier `regions/murkmire.md` |
| **A round island off the east coast of Arnesia**, "dark green/gray terrain … different from anything seen in the rest of the province" | **east coast**, near Archon/Thorn | Lore:Arnesia (quoted verbatim above); dossier `regions/thornmarsh-and-east.md` |
| **"Islands lie south of the city"** | south of **Soulrest** | Lore:Soulrest; dossier `soulrest.md` |
| Murkmire "was swallowed by the Southern Sea"; land "gives way and fades into the water" | south coast | dossier `regions/murkmire.md` — explicit licence for drowned ground and stacks |
| Topal Bay piracy: "notorious for rampant piracy" on the Black Marsh side | SW coast | Lore:Topal Bay; dossier `regions/waters.md` |

So canon *requires* at least one distinct offshore island (Arnesia's) and
strongly invites two more (Norg-Tzel, Soulrest's). Note we already have a
plausible host: an existing **26 ha, 53 m-high ocean island at u≈0.93, v≈0.18**
— the far east coast, the right quadrant for Arnesia's round island. Naming and
using what already exists costs nothing.

Also note the "pirate-freeholds" culture zone is plotted in the **north**
(Alten Corimont, Shadowfen), not Topal Bay — so "pirate island" content does
not need a southern island.

## 3. Where an island would be authored, and what re-runs

The pipeline (`tooling/world-generation/README.md`) has a clean insertion point.
`refine_province.impose_blackrose_lake` already sculpts an authored lake **with
an island in it**, deterministically, from a fixed seed, using `carve_polyline`
for its channels. An `impose_coastal_islands(h, ...)` step next to it, reading a
committed `world/sources/terrain/authored-islands.json` (id, centre uv, radii,
crest height, shore profile, wobble seed), is the natural shape and satisfies
the determinism + stable-ID standards.

**Do NOT put it in `sculpt_province`** (step 4b). That is upstream of hydrology
and society, so the README's "rerun 2–7" would regenerate every owner-approved
raster — hydrology, regions, danger, cultures, roads, boat lanes. Not worth it.

Placing it in `refine_province` means Phase 3/4 outputs are untouched, at the
cost of one integration gap (below).

| Step | Re-run needed? | Cost |
|---|---|---|
| 2 `compile_hydrology` / 3 `compile_society` / 4b `sculpt_province` | **no** | — |
| 5 `refine_province` | yes | full-res 4033² pass, several minutes; rewrites `refined/height-rg.png`, `ground-control.png`, `ground-tint.png`, flood, portages |
| `compile_water` | yes | minutes; water class/shore/surface rasters |
| 6 `compile_chunks` → 7 `export_web_chunks` | yes | minutes; **rewrites all 770 committed chunk PNGs (~52 MB)** |
| `compile_scatter` (vegetation bundles) | yes | reads committed rasters only |
| `terrain_scour`, `macro_plot`, `export_places`, `compile_minor_routes` | yes | committed-rasters only, fast |
| Catalogue records for whatever goes on the islands | yes | authoring, not compute |

**Timings are not recorded anywhere in the repo.** Estimate 30–60 min of
machine time for the whole refined-downstream chain; whoever does this should
record the real numbers in the world-generation README (a genuine docs gap).

The vault is present and intact
(`…/tamriel-worldspaces-118678/extracted/Argonia Worldspace/argonia-heightfield/`:
source, sculpted, hydrology, water, province-refined), so nothing has to be
re-downloaded or re-extracted.

### The one integration gap

Phase 3's `ocean` mask is coarse and would still call the new island's footprint
"ocean". That mask feeds `compile_water` (shore/class/surf), `landcover`'s coast
typing (mangrove mud vs beach sand vs rocky cove) and the routes/boat-lane cost
surface. Fix by having the same authored-islands file publish a mask that
`compile_water` and `landcover` subtract, and by siting islands off the existing
boat lanes (`waterways.json`) — cheap, contained, and testable. Do not skip it:
skipping it gives islands with the wrong shoreline material and boat lanes
routed through solid ground.

## 4. Options

Effort is agent-hours including the pipeline re-run, verification and the
catalogue/plot work.

| Option | Geographic realism | Gameplay it buys | Effort | Risk to approved terrain/water/roads | When |
|---|---|---|---|---|---|
| **(a) None** — name and dress the 59 landmasses we already have, starting with the 26 ha east-coast one as Arnesia's round island | perfect (they are already there) | canon island set-pieces, a xanmeer islet, boat destinations — with zero terrain change | **2–4 h** (catalogue + plot only) | **none** | now, safely |
| **(b) 2–4 authored islets in lagoons/estuaries/deltas** (Stormhold–Helstrom–Gideon–Alten Corimont shallows, plus a delta bar off Soulrest) | **high** — 1 m water, silt supply, mangrove colonisation; textbook delta bars | shrine/xanmeer islets, mangrove hideouts, canoe-only destinations, boat waypoints; feeds Phase 9 | **8–14 h** | **low** — refine-and-below only, sited off existing lanes | **Part 6 (meso), not now** |
| **(c) Barrier-island chain** | **low** unless a shelf is sculpted first; a chain in 30–40 m of water is fake | lagoon-behind-barrier sailing, wreck field | **25–40 h** (shelf sculpt is the bulk) + re-review | **medium-high** — a shelf changes coast typing, surf, danger, boat cost province-wide | not recommended |
| **(d) One larger offshore island** (≥500 m) | **low** — needs a seamount/drowned-ridge rationale we do not have, and lands within ~1 km of the closed world edge | a real destination: pirate freehold, wreck reef, underwater ruin complex | **20–30 h** + a probable owner terrain re-gate | **high** — pushes the player at the world edge; competes with the 8b water review | not recommended |

Option (b) is additive to (a), not an alternative: do (a) first regardless.

## 5. Recommendation

1. **Now (Part 4/5, hours):** take option (a). Name and use the islands the
   province already has — bind the 26 ha east-coast island to **Arnesia's round
   island** (its "dark green/gray terrain" is a free, canon-flagged distinct
   biome), site **Norg-Tzel** on an existing SE-of-Lilmoth landmass, and put
   Soulrest's canon "islands to the south" on the ones already off that coast.
   Zero terrain risk, closes three canon gaps.
2. **Part 6 (meso terrain window):** add **option (b)** — 2–4 estuary/lagoon
   islets as one `impose_coastal_islands` step in `refine_province`, driven by a
   committed `authored-islands.json`, with the ocean-mask patch for
   `compile_water`/`landcover`. Sculpt them in the ≤1 m shallows only; nothing
   in the deep bathtub. Then re-run refine → water → chunks → web chunks →
   scatter → scour → plot, and diff the rasters before committing.
3. **Never:** barrier chains or a big offshore island, unless the owner
   separately decides to sculpt a real continental shelf — at which point it is
   a terrain phase of its own, not an add-on.

Doing (b) **before** Part 6 would mean re-running the plot twice and re-reviewing
terrain the owner has just approved; doing it **after** Part 6 would mean
re-plotting places that were already sited. The Part 6 window is the one moment
where it is nearly free.
