# 0041 — the Phase 11 delivery plan (Parts 0–8), as authored 2026-09-01

> Provenance only, moved out of [decision 0041](../../../decisions/0041-phase11-settlement-decisions.md) on 2026-09-11. Phase 11 was absorbed into [Phase 16](../../../phases/16-foundation-and-places/README.md); the live rules are world/96, world/97 and the sections that remain in 0041.

## Delivery plan

**Shape (owner directive, 2026-09-01): breadth first, then depth.** Do NOT
place one thing at a time and discover late that the province has dead-ended
— derive and plot *everything* at a shallow depth first, review the whole
picture, and only then author exemplars deeply. Parts 1–4 are province-wide
and cheap (they are text, data and dots on a 2D map, not geometry); Parts
6–8 are deep and per-place.

**Planning agent's steer on "derive the whole province at once": yes, do
it.** It is the right call and it is not expensive — the catalogue is data,
and the big-picture properties the owner cares about (coverage, coherence,
variety, density, distribution) are *only* visible in aggregate. The cap is
**depth, not breadth**: every place province-wide gets a catalogue record
(type, siting logic, importance, vibe, asset plan, why); nothing gets
interiors, quest text, loot tables or blueprints until its packet is
authored. If the catalogue turns out to be enormous, fan out Opus subagents
by region or by place-family rather than reducing coverage.

### Part 0 — foundations (before the owner sees anything)

Build the spine that every later part rides on. All of it is game machinery
or tooling; place it per the packages rule and the existing worldgen layout.

**Sequencing (2026-09-02): only items 1, 2 and 6a gate the catalogue.**
Items 3–5 (schema, compiler skeleton, renderers) gate nothing before Part 6
— run them concurrently with Parts 1–4, kept in the one schema/compiler pair
of hands while catalogue derivation fans out. Do not make the owner's first
touchpoint wait on compiler work it doesn't need.

1. **Site survey tooling — know the land before proposing anything**
   (owner directive, 2026-09-01). A settlement proposal made without
   reading the terrain is a guess; build a one-command **site dossier**
   generator that, for any coordinate + radius, pulls everything the repo
   already knows into one structured artefact: elevation/slope/aspect
   stats and profiles (refined heightfield), hydrology (channels, water
   levels, wet-season/flood exposure, salinity), region class + climate
   fields, danger band, existing routes/boat lanes and distances to
   neighbours, current vegetation (density, species mix, canopy from the
   compiled scatter), viewsheds (what landmarks are visible from here,
   where this site is visible from), and the nearest mined-form analogue
   (which BM&V cluster shape fits this ground). The dossier feeds THREE
   consumers: the agent's own siting/layout reasoning, the causal model
   ("why here" answered from the land, per module 40 §28), and the owner's
   review packets. Every siting or layout proposal cites its dossier.
2. **Province terrain scour** (feeds Part 1). The same machinery run
   province-wide instead of per-site: sweep the heightfield, hydrology and
   region rasters for **naturally interesting ground** and record it as
   candidate-site data — summits and prominent peaks, saddles, ridge
   ends, cliff benches, ravines and box canyons, dead-end gorges, enclosed
   clearings, islands and islets, oxbows and confluences, river mouths,
   coves and inlets, natural harbours, sinkholes, karst, waterfalls,
   spring heads, isolated highs in flood plain, narrows/chokepoints,
   fords, land bridges, and every landform §12.3b calls hard-to-reach.
   Score each for prominence, accessibility (how much effort to reach),
   concealment, visibility/viewshed, and water relation. This is the
   province's supply of *interesting places*; Part 1's demand is matched
   against it in Part 3. Deterministic and seeded (standard 6).
3. **Blueprint schema, in code.** Turn module 40 §30's `SettlementBlueprint`
   (+ `GenerationProvenance`, and the quest `QuestWorldProvision` interface
   from quests 20 §13) into real typed schemas. Semantic authoring
   throughout: S-ladder refs for actors, tier+provenance for loot.
4. **Compiler, walking skeleton.** A deterministic
   blueprint → compiled-settlement pass in `tooling/world-generation/`:
   siting on real terrain, district/parcel/route grading, building
   placement as kit assemblies (statistics from the mined form tables —
   counts, spacing, water/road orientation), docks/boardwalks on real
   water, exports the same bundle/manifest shapes the studio already
   streams. Don't gold-plate: it needs to compile ONE settlement well
   before it needs options. The compiler owns **vegetation clearing**
   (owner directive, 2026-09-01): settlements may clear trees and plants
   from their footprint to make layouts work — that is what real builders
   do. The blueprint declares its cleared areas (building parcels, routes,
   commons, sightlines) and its *kept/managed* vegetation (the Hist tree
   above all, shade trees, reed beds worked as a resource); the compiler
   emits clearance masks that the scatter compiler and the runtime
   groundcover ring respect, and the affected chunks' vegetation is
   recompiled. Clearing is graded, not binary — a hard-clear core, a
   worked/thinned fringe, wild beyond — so settlements sit *in* the marsh
   rather than on a cut-out disc. **It also owns ground fitting — see the
   "Slopes and uneven ground" gotcha below; treat that as a first-class
   part of the skeleton, not a polish item.**
   **Clearing gotchas (owner question, 2026-09-02) — binding on the
   clearing integration:** (a) colliders are safe by construction ONLY
   because they derive at runtime from the same compiled instance list
   that renders — so clearing MUST work by recompiling affected chunks,
   never by hiding meshes; (b) the **runtime groundcover ring** generates
   grass from rasters at runtime and must read the clearance mask itself,
   or grass grows through floors; (c) **all vegetation tiers rebuild in
   the same compile** for affected chunks — near scatter recompiled while
   the distant billboard layer isn't gives ghost trees that vanish on
   approach (same rule as building LOD). The skeleton emits masks +
   affectedChunks; the scatter compiler and the runtime groundcover ring both
   consume them since 2026-09-09, through the one keep-factor rule in
   `worldgen/settlement_clearance.py` and its TypeScript twin. Principle
   [C13](../../../world/97-placement-principles.md) describes what runs; the
   playbook's step 7b says when to re-scatter.
   **Phase 10 caution (2026-09-02): tree-collider work is still in flight**
   — a parallel agent is finalising trunk solidity (round 9+ did not pass).
   Design the clearing-mask interface against the scatter compiler's
   *data* contract (compiled scatter + collider budget inputs), don't
   couple to collider internals mid-change, and expect to recompile
   affected chunks once that lands. Pathspec-only commits; keep clear of
   the vegetation-collider files that agent owns.
5. **Review artefact renderers** — the owner's viewport, so build early
   and make regeneration one command each:
   - *The plotted province map* (Part 4's medium): the 2D province map with
     every catalogue place plotted, filterable by tier/type/region, each
     dot hoverable/clickable for its record and its **why**. Build it in
     World Studio's existing 2D map view (module 85 §67) — dots and a
     detail panel, NOT the heavyweight 3D city markers.
   - *Blueprint map*: top-down annotated diagram (districts, routes,
     docks, landmarks, water, contours) over a terrain hillshade crop.
     Seconds to regenerate; the layout-iteration medium.
   - *Massing stills*: headless Blender renders of the compiled settlement
     GLB — one ortho, 3–4 player-eye views (extend `render_preview.py`).
   - *Deployed walk*: the compiled settlement streamed in the studio at
     real vegetation/light/water (the final-feel medium; push to Pages).
6. **Assets — inventory first, kits later (split 2026-09-02** so kit builds
   stop gating touchpoint ①):
   - **6a. Browsable asset inventory** — what building families, materials,
     palettes, props and landmark pieces we actually have or can source:
     vault first (BM&V architecture is the house style; Tropical Skyrim;
     xanmeer tileset per module 90 §74.2), plus the module 90 §75/§80
     priority mods as *sourcing candidates*. Part 1 writes descriptions
     *against* this, so we design for the breadth we own rather than
     inventing what we lack. This is a survey, cheap, parallelisable.
     **DELIVERED 2026-09-02:** `world/sources/placement/settlement-asset-inventory.json`
     (schemaVersion 1, registered) + digest
     [settlement-asset-inventory.md](../../placement-settlements/settlement-asset-inventory.md).
     **Revised same day (round 2)** after owner feedback that round 1
     under-searched: a full-vault sweep plus Nexus research. Headline for
     Parts 1–2 — we can build stilt/boardwalk/dock/platform settlements and
     Imperial stone-timber towns well, **and now also a Shadowfen mud
     culture, the Argonian prop language and a Hist tree** (Mud Mother Grove
     landed in the vault). The xanmeer "exterior" set turned out to be a
     *terrace kit* — stacking terraces IS a stepped pyramid — so that gap is
     ornamental, not structural. **Still genuinely missing: rafts and canoes
     (every hull we own is keeled and foreign — now the top sourcing job),
     grave-stakes, mud-hut variety, and ornate monumental frontage.**
     Two new blockers for the owner: **Darkwater Den is permission-blocked
     for public work**, and several ideal sources carry a "no porting to
     other games" clause that our browser engine arguably trips — that needs
     an owner ruling, not an agent's judgement.
   - **6b. Kit sourcing and builds** — download the priority mods
     (Argonian mud hut, Marsh-Rest, xanmeer kit, clutter) with the Nexus
     key, registry → build a `settlement-v1` kit → vet, per the flora-kit
     pattern. Needed by Part 6, not Part 1 — run it in parallel (subagent)
     while the catalogue is derived. Respect the two-culture kit rule in
     `material-culture.md` — the kits must never blend. Credits in root
     README in the same change.

### Part 1 — DERIVE: what places must exist, province-wide

Breadth-first derivation of the full demand list. This is the macro rung of
the placement ladder (module 40 §28b) executed once, for the whole province,
before anything is sited.

**Derive from every source, systematically:**

- **named canon** — the settlement register, quests 20 §12b's named
  settlements and their required features, lore dossiers, UESP;
- **what canon implies** — institutions imply their buildings and their
  abuses; trades imply their infrastructure; beliefs imply their sites;
  history implies its ruins and its abandoned predecessors; every era layer
  (Ayleid/Barsaebic, Imperial, post-Flu, post-Umbriel, current) leaves
  physical residue;
- **the quest plan** — every quest's world provisions (see the quest fold-in
  below); quest-required places enter the catalogue as hard rows;
- **demographics and economy** (module 92) — populations need food, water,
  fuel, trade, defence, worship, burial, labour, law, waste, and travel;
- **ecology and danger** (module 20 §16, workstream L's ecology feed) —
  habitats imply lairs, hunting camps, culls, quarantines;
- **the land itself** — Part 0's terrain scour: interesting ground is
  *demand-generating*, not just supply. A spectacular hidden cove should
  make you ask "what would be here?"

**Build a hierarchical taxonomy** (class → family → type → variant), not a
flat list: e.g. *settlement* → *marsh village* → *stilt village*, *raft
village*, *hammock village*, *tree-platform village*; *ruin* → *xanmeer*,
*Imperial*, *Ayleid*, *drowned village*; *camp* → *bandit*, *pirate*,
*hunter*, *pilgrim*, *refugee*, *slaver/Owing*, *poacher*, *prospector*;
*works* → *toll*, *dock*, *ferry stage*, *kiln*, *saltern*, *fishery*,
*logging*, *mine*, *plantation*; *sacred* → *Hist site*, *shrine*,
*grave-stakes field*, *ancestor site*, *cult site*; *lone* → *hermit*,
*hunter's lodge*, *watchtower*, *lighthouse*, *wreck*, *cache*, *grave*,
*standing curiosity*. **These are examples, not the list — see the breadth
rule below.**

**Give each type a recipe, not just a name.** The research doc distils
Bethesda's unmarked POIs into a **five-slot schema** worth using literally:
① a long-range cue (smoke plume, banner, silhouette) that says "something
is there"; ② a small population with one elevated/ranged member; ③
domestic props that narrate who lives here; ④ a free reward plus a gated
one (locked, hidden, or guarded); ⑤ optionally a satellite node 200–400 m
away that resolves the implied story. Record per-type deltas from that
baseline in the catalogue.

**Derive counts, not just kinds — in three tiers, not one number.** A single
POI-density figure is a design error
([openworld-place-distribution-and-siting.md](../../placement-settlements/openworld-place-distribution-and-siting.md)):
every successful open world runs a **fine tempo layer** (something every
~60–100 s of travel; Skyrim ~14/km², Vvardenfell ~18/km², BotW's Koroks
~15/km²) over a **much coarser destination layer** (BotW shrines ~2/km²,
~3.5 min apart), plus **landmarks** visible from far off. Derive all three
separately, and check them separately. Work from the binding numbers in
module 95 Phase 11 (18–22 named POIs/km² D0–D3, 8–12 D4–D5, something named
within ≤300 m of every road and boat lane; quests per settlement by
magnitude) and
[morrowind-content-density.md](../../placement-settlements/morrowind-content-density.md).
The catalogue must be *large*: province-scale coverage at Morrowind density
is thousands of entries, and that is the point. Fan out Opus subagents by
region or family to get there.

**Derive variety deliberately** — within families and between them; see the
distinctiveness ladder and the breadth rule below.

### Part 2 — DATA: the place catalogue

Record the derivation as one machine-readable catalogue (per-region files,
stable IDs per standard 2, `schemaVersion` per standard 7, seeded and
deterministic per standard 6). It is the phase's central artefact: Parts 3–8
all read and update it, and Phases 12/13/15 inherit it.

**Each place record carries (design this properly, then freeze the shape):**

- **identity** — stable ID, name (or the naming rule + language register if
  unnamed yet), aliases;
- **classification** — taxonomy class/family/type/variant; magnitude class;
  status (active / ruined / abandoned / seasonal / drowned / contested);
- **provenance** — canon-named | lore-implied | quest-required |
  geography-derived | density-fill, with sources cited and a confidence;
- **the why** — founding cause, site advantages, current occupants and
  their motivations, pressures, and what would make it change or die
  (module 40 §28's model, in short form at this stage);
- **siting** — region(s) and region classes it belongs in, its siting
  grammar reference, hard constraints vs preferences (water relation,
  slope, elevation, concealment, route relation, neighbour spacing), and —
  once Part 3 runs — its plotted location, the candidate sites considered,
  and **why this site won**;
- **relations** — depends-on / supplies / rivals / patrols / tolls /
  visible-from / reached-via, and the travel-service edges it implies;
- **people and power** — culture, faction/ownership, occupant roster as
  S-ladder semantic refs, notable NPC slots;
- **danger and access** — danger tier, traversal modes to reach it
  (walk/boat/swim/climb/fast-transit) and the required fallback per quests
  20's traversal rule; effort-to-reach score;
- **reward profile** — §12.3b: what the player gets for coming, of which
  type, at roughly what value tier;
- **visual and vibe** — the look, in words: silhouette language, palette,
  materials, signature feature, condition/wear, mood, light, sound and
  smell cues, and what the *approach* reveals. Grounded in lore/research;
- **asset plan** — the actual kits/mods/pieces this place will be built
  from (written against Part 0's asset inventory), so the catalogue is
  feasible by construction and the province visibly uses the breadth we
  own;
- **discovery** — how the player learns it exists: sightline, road
  proximity, rumour, document, or nothing at all (diegetic only — no
  markers);
- **quest hooks** — provisions requested/owned, tier ownership (tier-0
  protection respected);
- **build-out keys** — the forward-compat slots from the run-book block:
  discovery pointer, letter/rumour pool key, deed-counter keys, socket
  lists (typed, may be empty). IDs in this catalogue are permanent — cut
  places change `status`, never disappear;
- **complexity budget** — a feasibility flag: nothing may require
  placement rules or scripting beyond Morrowind's level (owner rule); most
  places are compiled semi-procedurally, so each must be *both*
  interesting *and* simple to build;
- **importance tier** — drives Part 3's plotting order and later authoring
  effort;
- **workflow status** — derived → plotted → authored → frozen.

**Then have it critiqued, before any plotting** (Opus subagents, adversarial
briefs, in parallel): (a) coverage and density against the numbers; (b)
hierarchy and taxonomy quality; (c) variety within and between families —
does this read as one province with distinct regions, or as a list?; (d)
lore fidelity and era correctness; (e) **feasibility** — anything demanding
more than Morrowind-level placement/scripting complexity, or assets we do
not have; (f) *what is missing* (the completeness critic — its whole job is
to name absent families, unrepresented economies/eras/ecologies, and
monotony). Fix, then produce **a short owner-facing summary** (counts by
family and region, the variety story, the load-bearing choices, the vibe
spectrum with examples) and take the owner's steer on vibe and any
load-bearing calls. Text is fine here (owner ruling 2026-09-02) — but where
a visual is *fast and cheap* (asset-inventory stills already rendered by
the pipeline, a palette strip per region), attach it; never build new
machinery just to illustrate the summary.

**Size the catalogue on real numbers** (CORRECTED 2026-09-02 by the
coverage critique — the earlier 600–740 applied the fine-tempo rate to ALL
land and was wrong): authored land is 33.52 km², splitting **D0–D3
20.59 km² / D4–D5 11.93 km²**, so the binding budget is
**18–22 × 20.59 + 8–12 × 11.93 ≈ 466–596 poi records**, allocated by each
zone's land share and danger mix — never by agent effort. The critique
found 729 records with half of them on 18 % of the land; the repair
directive below rebalances via `status: deferred` (IDs permanent, records
parked for later packets), retypes and targeted top-ups.

### Critique round + repair directive (2026-09-02)

Five adversarial critics, five PASS-WITH-FIXES verdicts; full findings in
`docs/research/phase11/phase11-critique/` (coverage-density, variety-
distinctiveness, lore-fidelity, feasibility, completeness). Schema
hardening already landed (commit `d8669d7`): canon-named/canon-derived
provenance split, season/eraLayers/densityLayer/entrance/underwaterAccess
vocabularies (strict-mode until the back-fill completes), name-required,
citation lint, asset-alias hook, `deferred` status. **Repair is executed
per region-pair by four agents (same ownership split as derivation), then
one verify/wrap agent.** Each executor fixes, for its own files, ALL of:

1. **Rebalance to the corrected budget** (numbers per region in the
   coverage doc): defer lowest-value over-density records
   (`status: deferred`, one-line `deferredWhy`); retype surplus
   cheap-furniture types into the under-band vertical/underwater/seasonal
   types where the record honestly supports it; author top-ups ONLY in
   dunmer-north and imperial-fringe (which sit at ~0.5–0.7× budget).
2. **Back-fill the strict fields** on every record: season, eraLayers,
   densityLayer, entrance (module 70 §47 — vary it), underwaterAccess.
3. **Vibe visual layer**: replace region-constant palette/materials/senses
   (interior) and empty condition/approach/missing silhouette (south) with
   per-record content; break the 109 visual-twin pairs on ≥3 axes; fix
   the naming issues (14 duplicates, "The " monotony, regional registers).
4. **Discovery honesty**: sightline claims only where a canopy-breaking
   cue exists; else road/rumour/document.
5. **Sockets, ownerFaction, notableNpcSlots, rumourPoolKey, variant
   slots**: quest-capacity per the coverage doc (M4/M3 sockets), tier-0/1
   records never socket-less; ≥1 LocalStateVariant slot on quest
   locations; faction seats per the completeness doc.
6. **Lore fixes** (lore doc's ranked list): Tenmar/Ten-Maur-Wolk merge
   (west), Flu arithmetic (six records), canon-named→canon-derived
   reclassification (~14), blue-flower exclusivity, missing canon places
   (Root-Whisper Village + Deepmire → naga-kur-deeps; Hutan-Tzel →
   dunmer-north; **Xal-Krona's lair** → hist-heartland, tier 0);
   interior building-kit ruling (interior executor): extend
   material-culture.md with the grown-root interior kit and fix the
   108-record kit-blend.
7. **Feasibility fixes** (its doc): the buoyant-causeway class (4
   records), landform demand into the typed field, wildcard tokens
   replaced, azure→azura, grave-stake boilerplate, tide→seasonal-drawdown
   (8 records; the owner's environment-tweak permission covers
   canon-black water instead where appropriate).

The **verify/wrap agent** then: authors `asset-aliases.json` (slug→family
map) and fixes what it exposes; flips STRICT_REQUIRED into REQUIRED_AT;
re-runs all validators + a fast re-critique sample; records the round
result here. The scour-detector relaxation (flood-high etc.) is a
separate small tooling job before Part 3.

**Owner rulings on derivation richness (2026-09-02):** (a) the Blackrose
"reference watershed" special status is STALE — superseded in 00-core and
module 95 §85.2; no zone gets extra depth on that authority; (b) **all
province slices are derived equally richly** — record counts still follow
the causal density gradient, but per-record depth/quality (why, vibe
signature, relations, asset plan) must be uniform across regions; the
critique pass checks richness parity between zones explicitly.

**Owner ruling (2026-09-02): dungeon entrances are decoupled from geology**
— every entrance teleports to an interior cell, so "no rock for caves"
constrains surface entrances only (recorded in full in module 70 §47).
Catalogue/plot implication: dungeon-bearing records may sit anywhere the
*entrance* type suits (trapdoor, hollow trunk, underwater entry, sinkhole,
burrow, xanmeer stair-throat, well, grave-cut...); the root-hollow gallery
layer stays the interior's signature but is no longer the ONLY underground
answer. The critique pass should check entrance-type variety.

**Owner permission (2026-09-02): terrain/water/vegetation MAY be tweaked
during Phase 11** where canon genuinely requires it and the change is done
well — e.g. canon-black water in a swamp region ours renders blue/green, or
a canon-required vegetation type in an area that has a different one. Two
conditions: the change must be *necessary* (canon- or catalogue-grounded,
not taste), and done properly through the owning system (region water
params, palettes, scatter recompile — never a local hack). Known candidate
already: the naga-kur-deeps records are written on canon's black water.
Record each use of this permission here.

**Environment tweaks REQUESTED by the interior repair executor (2026-09-02),
not yet applied — they are systems-side jobs, not catalogue edits:**

1. **naga-kur-deeps water colour.** All 67 deeps records are now written on
   canon's black standing water (peat-stained, low visibility, blue
   bioluminescence as the only light). Needs the zone's water params/palette
   set accordingly in the owning system, not a local hack.
2. **Freshwater tide.** `tideResponse` is derived from salinity, so the deep
   interior cannot tide by construction (feasibility F7). The six deeps
   records that made tide load-bearing were rewritten onto **seasonal
   drawdown/refill**, which the season mechanism already delivers — no
   systems change needed, but the plot pass must confirm salinity < 0.05 at
   those sites, and `place.naga-kur-deeps.drowning-narrows-tidal-gate` keeps
   a now-misleading slug (IDs are permanent; the record's text is correct).
3. **No asset pool expresses `settlement-root-v1`.** The interior's records
   now specify a grown-root kit whose nearest available families are
   `bamboo-hut` + `hist-variants` + `azura-tree` + `argonian-props`;
   `mud-mother-grove` (the Shadowfen mud kit) is still carried by interior
   records because nothing better exists. A root-kit pool (or an alias set)
   is an asset-registry job — flagged for the verify/wrap agent.

**Interior building-kit ruling (2026-09-02, lore critique C1).**
`world/sources/lore/topics/material-culture.md` now carries three Argonian
kits — `settlement-mud-v1` (Shadowfen), `settlement-stilt-v1` (Murkmire) and
**`settlement-root-v1`** (the interior: root trained while living, withy and
flint-vine lashing, sap-resin sealing, bark/frond roofing, chimes at every
threshold, no stone and no reed) — plus a `/deeps` Naga-Kur variant (cane,
bog-oak, hide, worked bone, undressed dredged block). The never-blend rule is
unchanged in spirit: one building is one kit; a settlement is one kit unless
its `why.founding` says why not; foreign work layers, never blends.

**Scour findings that bind Parts 1/3** (2026-09-02, full digest in
`world/sources/sites/candidate-sites.md`; 1,172 scored candidate sites in
`candidate-sites.json`, dossiers for all nine anchors in `sites/dossiers/`):

- **Almost no long sightlines below the mountain rim** (median site sees
  18 % of its 1.2 km surroundings; nothing 12 m tall reads at 1.4 km).
  Landmark strategy must be tall-or-close: canopy-breaking silhouettes
  (xanmeers, great trees, smoke, lights) and short-range reveals, not
  Skyrim-style distant-vista pulls.
- **Enclosed clearings (6 found) and sinkholes (11) are genuinely rare** —
  the interior is too gentle and hydrology floods depressions away. Types
  that need them must be *authored* into terrain-adjacent form or spent
  sparingly; they cannot be found on the ground.
- **A quarter of the interesting ground is on the mountain rim** where the
  fewest people live — Part 3 must *make* interior interest from water,
  vegetation and built form, exactly as the non-uniform-density rule says.
- **Gideon's approved anchor sits on steep ground** (p50 slope 20°, 14 %
  buildable in a 400 m disc) — Part 6 must nudge within `toleranceUV`.
- Capped detector classes are flagged in the digest — raise the cap before
  concluding scarcity.

### Critique round OUTCOME (2026-09-02, verify/wrap agent)

**Verdict: the round closes.** All five critics' mechanical findings are at
zero or explained; every gate is green (`python -m worldgen.catalogue --check`,
191 pytest, `node tooling/repo-standards/check.mjs`, `npm test`).

**Headline numbers.** Before = commit `29c502b` (pre-repair); after = this
round. Re-runnable with `python3 -m worldgen.critique_sample [dir]`.

| check | before | after |
|---|---|---|
| live records (province) | 729 | **527** |
| region-constant vibe fields (≥25 % identical) | 8 | **0** |
| empty / missing vibe fields | 1026 | **0** |
| visual-twin pairs (same type, ≥2 identical vibe axes) | 121 | **0** |
| duplicate names | 14 | **0** |
| empty names | 0 | 0 |
| records missing any of the five strict fields | 729 | **0** |
| distinct entrance types used | 1 | **14** (of 14) |
| socket-less tier-0/1 records | 40 | **0** |
| `discovery: sightline` share | 27 % | **18 %** |
| sightline claims per km², worst zone | 21.7 (penal-south) | **3.4** (dunmer-north) |
| non-`all-year` season records | 189 | 103 |

The one number that moved the "wrong" way is *records with only `["current"]`
eraLayers*: 86 → 304. That is a back-fill artefact, not a regression — before
the round 729 records had no `eraLayers` field at all, so the 86 was measuring
the few that did. 43 % of records now carry a pre-current layer.

**Final totals.** 800 records: **527 live, 272 deferred, 1 cut**.

| region | live | deferred | cut | budget | |
|---|---|---|---|---|---|
| dunmer-north | 138 | 0 | 1 | 138–169 | at floor |
| hist-heartland | 111 | 0 | 0 | 94–130 | in band |
| imperial-fringe | 121 | 0 | 0 | 119–147 | in band |
| mercantile-coast | 56 | 84 | 0 | 45–56 | at ceiling |
| naga-kur-deeps | 39 | 28 | 0 | 22–32 | **+7, see below** |
| saxhleel-coast | 24 | 75 | 0 | 18–24 | at ceiling |
| imperial-penal-south | 21 | 49 | 0 | 17–21 | at ceiling |
| pirate-freeholds | 17 | 36 | 0 | 14–17 | at ceiling |
| **province** | **527** | **272** | **1** | **467–596** | in envelope |

**Work done this round, beyond the executors' passes.**

1. `asset-aliases.json` authored (42 slugs → inventory family ids); the
   validator's alias hook is live, so an `assetPlan` typo is now impossible.
   Fixed `azure-tree` → `azura-tree` in three recipes and one record.
2. **One JSON encoding.** The four executors had written the eight region files
   with two different `ensure_ascii` settings, so any edit re-encoded every
   em-dash and buried the real change. `worldgen.catalogue.dump_json` is now the
   single writer.
3. **Region rebalance.** Four zones were still over ceiling; 31 records deferred
   (lowest-value fine-tempo fill, tier 2+, non-canon only) under a guard that
   never takes a type below four live instances.
4. **countBands re-derived** for all 236 poi types from actual live counts. The
   old `test_poi_count_bands_sum_to_the_province_total` was retired as unsound
   (236 types × ±1 slack aggregates to a ±236 envelope) and replaced by two
   better checks: per-type "the band contains the live count", and **per-zone
   record budgets in `test_catalogue.py`** — the coverage critique's actual
   finding was a *distribution* problem the province total concealed.
5. **One new record**, to bring dunmer-north to its floor:
   `place.dunmer-north.let-upper-floor`, a `deniable-listening-post` — a
   previously unspent type and the only honest Fourth-Era Thalmor form, since
   canon records no Dominion presence inside Black Marsh while still crediting
   them with inciting the Accession War.
6. **Sweeps.** 1001 socket ids and 26 `localStateVariant` ids normalised to
   dotted `<kind>.<place-slug>.<name>`; standard 2 green for the first time.
   Three `supplies` relations re-pointed from the cut `tenmar-wall` to
   `wolk-market` (they were about the town, not the ruin). Verified: 0 broken
   relation targets, 0 `azure-tree`, 0 `darkwater`, ashroot-village's Hist
   flower is red.
7. **Strict flipped.** The five fields are in `REQUIRED_AT['derived']`; the
   `STRICT_REQUIRED` mechanism is deleted and there is no strict mode to forget.
8. Catalogue README gained the per-region **naming register + signature asset
   pool** table the variety critique asked for.

**No coastal retype collision.** The west and south executors did *not* both
over-fill the same under-band coastal types (`reef`, `fishing-bank`,
`bird-colony`, `keepers-lodge`) — saxhleel took 3/2/1/1, mercantile took only 1
bird-colony. The south executor's suggested extra coastal `keepers-lodge` was
therefore **not authored**: keepers-lodge sits at 4 inside its 4–5 band, and
mercantile-coast is already at its ceiling.

**Still open after this round.**

- **naga-kur-deeps at 39 vs a 22–32 ceiling** (1.2×, down from 1.8×). Taking it
  to 32 would have driven six types under-band, so the residue goes to Part 3's
  homeless-batch review. Recorded as an explicit exception in
  `test_catalogue.py`, not hidden.
- **Environment-side requests, still unapplied** (systems jobs, not catalogue
  edits): (1) **naga-kur-deeps black water** — all deeps records are written on
  canon's peat-stained black standing water with blue bioluminescence as the
  only light, and need the zone's water params/palette set in the owning system;
  (2) **Oliis Bay tidal amplitude** — the coastal records assume a working tide
  the water system does not yet express.
- **Scour-detector relaxation** (flood-high and friends were capped) — a small
  tooling job, needed before Part 3 concludes anything about scarcity.
- **`archon-thalmor-post` ID migration** stays a *wish*: place IDs are permanent,
  so the misleading slug is documented rather than renamed. Same for
  `place.naga-kur-deeps.drowning-narrows-tidal-gate`, whose record text is
  correct on seasonal drawdown while its slug still says tide.
- **BM&V extraction queue**: two records plan against `bmv-round-huts` and
  `bmv-stilthouse`, both `have-unextracted`.
- **Dressing tier**: 113 `district`/`dressing`-scope recipe types have no
  catalogue records by design — they are Part 3 / compiler work, and their
  countBands were deliberately left as per-settlement demand forecasts.
- Nine `poi` types remain unspent; Part 3 may spend them (their bands are 0–1).

### Part 3 — MACRO PLOT: approximate locations for everything

Match Part 1's demand against Part 0's supply of interesting ground, on the
2D map. Approximate positions only — no 3D markers, no geometry.

- **Plot in importance order**, tier by tier: canon majors first (the
  existing approved anchors), then quest-critical and named places, then
  regional keystones, then the long tail of density fill. Each tier
  reserves its ground before the next is placed, so the important things
  get the good sites — exactly how the major cities were plotted.
- **Record the why for every dot**, even at this resolution: which siting
  grammar, which candidate sites were considered, why this one won. A dot
  without a why is not plotted.
- **Density is non-uniform on purpose** (owner emphasis 2026-09-02; the
  research doc's finding): the per-km² numbers are *region averages*, never
  a spread. Real TES density follows causal gradients — thick in settlement
  hinterlands, along roads, rivers and coasts, around resources; thin in
  deep wilds, and the emptiness is itself meaningful (a D5 interior that
  suddenly has no camps is telling you something). Derive each region's
  density *shape* from its civilisation gradient, not just its total.
- **Respect distribution as you go**: the three density tiers by danger
  band, the ≤300 m-from-route rule, and spacing that reads hand-placed —
  **Poisson-disc for cluster centres, clumped sampling within a cluster**
  (even spacing alone reads procedural; our own mined data says real hand
  placement is clustered). Apply the pull/attention rules from the research
  doc: vary the landform between successive stops, never a straight line of
  identical beats, and let a landmark be visible from the approach to the
  next one.
- **Check with a visibility raster**, not by eye: compile a cheap
  "what can be seen from here" pass over the plotted map (Nintendo used
  playtest heat maps for this; we can approximate it statically) and look
  for dead zones with nothing to pull the player, and for over-dense
  huddles.
- **Anti-sameyness quotas, enforced mechanically**: no template used for
  more than ~25 % of instances in a region; any two instances of the same
  template within 2 km must differ on ≥3 axes; never two of the same
  template in sight of each other; every taxonomy family actually used.
  Emit a coverage report each compile.
- **Collect the homeless.** Anything that cannot find suitable ground —
  because its landform type is used up, or its constraints conflict — goes
  into a **deferred batch** rather than being force-fitted. At the end of
  the pass, reconsider that batch as a whole: swap allocations to place
  higher-value things better, relax constraints where honest, transform a
  place into a related type that fits the ground that IS available, or cut
  it — and record which, and why. This is the anti-greedy step; do not skip
  it, and report its numbers.
- Deterministic and seeded throughout; re-running must reproduce the plot.

### Part 4 — REVIEW: agent QA, then the owner sees the whole province

1. **Agent QA first.** Run the validators over the plot (orphan checks,
   density/spacing budgets, reward coverage, traversal fallbacks, region
   distinctiveness, homeless-batch resolution) and fix what they catch.
   Then a fresh Opus subagent reviews the plotted map cold, as a player
   would read it: is it coherent, varied, legible, tempting? Fix again.
2. **Then the owner review**, in the medium they asked for: the 2D province
   map with everything plotted, filterable, hover/click for each place's
   record and its why. Give them a short written orientation (what to look
   at, what you are unsure about, the 3–6 decisions that would most change
   the result). Iterate until they are content with the big picture.

Only after this does anything get built.

### Part 5 — exemplar selection (owner picks)

Propose, with reasons drawn from the catalogue: **one city** (owner is
involved in all major cities) plus **a few contrasting places** spanning
scale, culture, region class and danger — deliberately including at least
one small/simple type (camp, works or lone site), because most of the
province is that, not cities. The owner approves the set. (§85.4 requires
this proposal at phase start; it is now better informed because the
catalogue exists.)

### Part 6 — MESO, per exemplar: choosing the exact ground

For each chosen exemplar: run the site dossier over its plotted
neighbourhood, generate 2–3 exact candidate sitings, and choose — folding
in the deliberation the plot could not do at map resolution (micro-geography,
approach and reveal, buildable ground, water depth at the dock line, route
tie-ins, neighbour sightlines). Decide the **high-level design**: what must
be in this place, its districts and rough layout intent, its signature
feature, and its **specific asset selection** against the catalogue's asset
plan and vibe. Record every choice with its why; the owner steers here
(Round A of the hands-on loop).

**Geometry, never labels (owner ruling 2026-09-04, binding on Parts 6–8).**
Every siting and composition decision from here on is taken against the
actual asset geometry: the measured footprint, the silhouette, the full 3D
volume including every detail, and the snap/combination rules the piece's
author built in. A description ("a stilt house", "a quay arch") is a search
key, not evidence. Concretely: the meso compiler reads bounds/footprints from
the pipeline's mesh measurements, the blueprint renderer shows the pieces at
true scale before a choice is recorded, and a kit's own combination rules are
data the compiler enforces, not prose a reviewer remembers.

**Write-back rule (owner 2026-09-05).** A siting chosen here that differs
from the plotted dot is written back with `worldgen.apply_sitings`: the
blueprint's chosen candidate pins the record in `macro-plot-overrides.json`,
the macro plot re-solves around it, and the minor routes, waterways,
hostility measure and studio exports re-run. Now and for every future move.
Process detail and lessons: [world/96-placement-playbook.md](../../../world/96-placement-playbook.md).

### Part 7 — MICRO, per exemplar: blueprint, build, iterate with the owner

The steered visual loop, on one exemplar at a time. Each round = focused
work ending in a small visual packet plus 2–4 plain-English questions. Do
not batch rounds.

- **Round A — siting + layout.** Candidate sitings, then the causal model
  and blueprint map(s). Owner steers: where exactly, district shape, route
  logic, dock placement, landmark positions. Iterate maps until approved —
  regeneration is cheap, so offer variants.
- **Round B — massing.** Compile buildings; render ortho + player-eye
  stills. Owner steers: building mix, scale/silhouette, density, kit reads,
  Hist-tree prominence, how the place sits on its ground.
- **Round C — dressed walk.** Deploy; owner walks it at real vegetation,
  light and water. Steers: feel, approach reveals, wayfinding, edges —
  **and an FPS read on each quality setting** (the first exemplar is the
  first settlement-plus-vegetation performance data point; alongside it,
  present the compiler's static budget report so the owner's FPS number
  can be tied to counted causes).
- Repeat as needed. **After every steer, write the generalised rule into
  the Taste ledger below** — a steer that only fixes this exemplar is a
  steer wasted. Route fixes to the grammar/compiler, never hand-edits: the
  exemplar must stay reproducible from its blueprint (it becomes the
  compiler's first regression fixture).
- Exit: the owner explicitly declares the exemplar good and the flow
  trusted. Ask; do not infer.

### Part 8 — grammars, then autonomous rollout

- **Write the grammars down** as they converge: the type-siting grammars
  (meso), the **Hist-centred** and **Imperial-fringe** settlement grammars
  (module 95 deliverables), and the per-type layout recipes — all grounded
  in the mined form tables, the research docs, material-culture and the
  taste ledger.
- **The research rule, enforced on yourself**: before the first instance of
  any place type, check `docs/research/` for design research on how the
  source games and other open-world RPGs build that type; if thin, fill the
  gap (Opus subagent) and record the doc *before* placing. Baseline reading:
  [openworld-place-distribution-and-siting.md](../../placement-settlements/openworld-place-distribution-and-siting.md),
  [kit-level-design-and-layout-generation.md](../../placement-settlements/kit-level-design-and-layout-generation.md),
  [marsh-settlement-morphology.md](../../placement-settlements/marsh-settlement-morphology.md),
  [xanmeer-mesoamerican-reference.md](../../placement-settlements/xanmeer-mesoamerican-reference.md),
  [morrowind-content-density.md](../../placement-settlements/morrowind-content-density.md).
- **The location-orphan validator** (module 40 §32, including the §12.3b
  reward clauses) runs in the compiler pipeline, not as advice.
- **Then deliver autonomously**: the rest of the contrast set, the quest
  co-design loop per packet, density + reward budgets, travel services
  (ferry/boat-owner graph, re-authored root transit — Gideon wintertide
  only, the Owing at every tolled crossing, Reed writ enforcement points,
  talk→service-menu as a small contract), the quests 20 §12b named-feature
  roster with `QuestWorldProvision` records, D0 authoring and the
  player-stronghold reservation, and the module 85 §69 settlement probes.

### Part 9 — wrap

- **Freeze checklist**, explicit and deferred: per packet, the 10b probe
  list, the 10c validation list, and the §65b completeness check — so those
  agents can freeze packets without re-deriving this phase.
- Batched owner review of everything delivered autonomously: what to walk,
  what to check, how to feed back — including an FPS read (settlements plus
  vegetation is the new worst case).
- Round records in this doc (defect → cause → fix, 0036 style); PROGRESS
  row and *Waiting on user* current; docs README router updated; credits for
  every sourced mod.

---

