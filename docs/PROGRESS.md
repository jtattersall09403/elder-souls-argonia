# Build progress

Single source of truth for where we are in the build sequence
([world/95-build-sequence.md](world/95-build-sequence.md) §86). Read this file
first, then open only the master-plan sections the active phase needs.

## Protocol (all agents)

1. **Trust the repo over this file.** Before building on a phase marked done,
   spot-check its evidence (run the gates, check `git log`). Before anything
   else, run `git status` — a dirty tree means a previous agent stopped mid-work or is currently working.
2. **Starting work:** in one commit *before* the work itself, make the **whole
   file** consistent — set the phase row to `in progress` with a one-line
   current task **and** rewrite *Waiting on user* and *Next up* to match. Those
   two sections are what go stale: a row reading `in progress` while *Next up*
   still advertises the same phase as upcoming is the contradiction to avoid.
3. **Work in small commits.** Every commit should leave `npm test` and
   `npm run typecheck` green from the repo root.
4. **Finishing a milestone:** flip the row to `done` with one line of evidence,
   in the same commit as the finishing work — and refresh *Waiting on user* and
   *Next up* in that same commit, per rule 2.
5. **Crash recovery:** if a row says `in progress` but no agent is running, use
   `git status`, `git log -5` and the gates to decide whether to finish, redo or
   revert the partial work; then correct this file.
6. **Keep this file under ~80 lines.** Detail belongs in `docs/decisions/` or
   phase docs, not here. Prune rows for long-finished phases into one line each.

## Status

| Milestone (plan §86) | Status | Evidence / current task |
|---|---|---|
| 0 — source, era, credits foundation | done | decisions 0001-0004; credits list in the root README (0023, 0024) |
| 1a — monorepo migration, CI, deployed sandbox | done | owner playtest PASS 2026-08-22; gates green; Pages live |
| 1b — package boundaries and contracts | done | packages/contracts + apps/game + apps/world-studio; inventory extraction deferred to Phase 7 |
| 2 — province source ingest | done | anchors owner-approved 2026-08-22; sea level 0005; scale 0006; major-city road network registered |
| 3 — province hydrology and region graph | done | owner-approved 2026-08-22; stats in hydrology-meta.json |
| 4 — danger, cultures, transport | done | owner-approved 2026-08-23: danger, 8 culture zones, transport graphs, climate, access model (0007), lore dossiers |
| 5 — World Studio foundation | done | owner flyover gate PASS 2026-08-23; map + 13 layers, 3D fly/orbit, reproducible URLs |
| 6 — province terrain (scope extended from basin to whole province at gate, 0008 addendum) | done | owner province gate PASS 2026-08-24 over 6 rounds; refine_province + 256 chunks x3 LODs |
| L — lore extrapolation loop (parallel workstream, module 45) | done | complete 2026-08-24: 39 files, full UESP sweep, gap register zero open, quest deltas applied. Workstream closed |
| 6b — province rescale + mountain relief + naturalness (0015; plan §86 Phase 6b) | done | owner walk PASS 2026-08-25 ("absolutely perfect"); x1/x1, sculpt stage, 8 standing probes (0015) |
| 7a — physical character integration | done | owner playtest PASS 2026-08-24; packages extracted (0013), studio character mode on Rapier chunks (0014) |
| N — quest-plan cast/lore/deliverability/fun review (parallel workstream, decision 0018) | done | done 2026-08-25/28: cast model, main quest sharpened (0026), full QA repair (0030) |
| 8a — world time, natural light and sky | done | owner gate PASS 2026-08-26 after 8 rounds; decisions 0020/0021 |
| 8b — water renderer and interaction | done | owner CLOSED 2026-08-28, good-enough not perfect; full history in 0025; leftovers in polish-backlog |
| 8c — weather and atmosphere | done | owner CLOSED 2026-08-30, good-enough not perfect; full history in 0032; GAME_TIME_SCALE = 30 |
| 10 — asset deep catalogue, kits, vegetation machinery (0034) | done | Owner CLOSED 2026-09-04 ("tested and working"); full history in [0036](decisions/0036-phase10-placement-decisions.md). Density ladder re-based and DELIVERED 2026-09-09 ([0048](decisions/0048-vegetation-density-ladder.md)): jungle is now the densest canopy at its owner-approved level, every other class re-based to it, ~51% fewer trees province-wide, `test_delivered_ladder` green. Flora kit 81->108 assets, groundcover 7->34, grass given a region axis, every region carries >=2 species no measured neighbour has. Leaf cards no longer fitted as solid wood (mangrove 4.4x->1.27x of trunk girth, worst tree 10.9m->2.08m). |
| 11 — settlement/location system, exemplar-first (0034) | absorbed into 16 (2026-09-11) | Parts 0–6, Round A, assemblies, doors, promise rounds, B1 (buildings drawn 2026-09-09), the span trim and the rollout plot are recorded round by round in [0041](decisions/0041-phase11-settlement-decisions.md) and [research/phase11/phase11-gap-plan.md](research/phase11/phase11-gap-plan.md). The owner's walk of 2026-09-10 found the delivered settlements wrong at the runtime boundary ([audit](research/phase16/audit-settlements-delivered.md): yaw sign inverted, box colliders, anchoring to the terrain maximum, pads never shipped); the fixes and the exemplars now run as Phase 16 chunks 16h–16j |
| 12 — dungeon/interior system, exemplar-first (0034) | todo | its exemplar slice (interiors for the five Phase 11 places) runs inside Phase 16 chunk 16i; the grammar and rollout stay here |
| 9 — swimming, climbing, boats (re-slotted after the placement exemplars; 0034) | todo | player craft only — ferry/fast travel is Morrowind-style world content (Phase 11); thin swim slice may pull earlier; boats may slip. **The swim slice BUILDS the underwater set dressing** (submerged scatter band, wreck/submerged-ruin statics, one wreck place) on its exemplar — owner 2026-09-04, world 95 Phase 9 / 65 |
| C — parallel combat workstream (sandbox; feeds 10b) | done: female characters, collar seam, per-sex hurtbox | All 35 melee weapons and 245 attacks measured from mounted geometry and sourced motion. Bow sight uses a 5° elevation, locked aim centres once then detaches to mouse input, and stationary bow turns pivot around a planted sole. Ten playable bodies use distinct Skyrim-authored NPC FaceGen, FaceTint, skin/hair colour and body-weight data. Full-surface head registration and body-loop stitching close the neck in bind pose and animation; matched skin weights prevent reopening. Bodies match `NAM7` weight, beast FaceTint works without a humanoid detail map, HairTint brows/hair/beards use alpha-tested source cutouts, and ordinary enemies no longer receive a test tint. Automated build contracts plus close/full-body inspection of both the ten defaults and ten race-valid alternates pass; the accepted Bosmer use actual Bosmer records and no Dark Elf hair parts. Full slider/head-part/tint generation is scheduled for 10b, with stats integration in 10c. See [0040](decisions/0040-animation-packs-and-combat-parallel-pass.md) round 14 and [FaceGen pipeline research](research/combat-and-systems/skyrim-facegen-runtime-pipeline.md). **Female characters delivered 2026-09-10 ([0054](decisions/0054-sex-is-an-axis-not-a-second-set-of-races.md)):** ten races x two sexes = **20 built bodies**, sex carried as its own axis rather than twenty race ids, so the phase-10b character creator inherits the two inputs it actually needs. All vanilla assets -- no sourcing job. The ten female donors are real `Skyrim.esm` NPCs (Annekke, Alessandra, Muiri, Ahlam, Niranye, Brelas, Avrusa Sarethi, Ghorza gra-Bagol, Khayla, Keerava). Appearance values stop being transcribed: QNAM/HCLF/NAM7 and per-race-and-sex height are read from the plugin by `pipeline/npc_records.py`, with a test holding all 40 configs to it (the ten transcribed male values were correct to 1e-9). The picker is a sex toggle plus a fixed 2x5 grid with roving focus, not ten pills in a wrapping row. **Four defects found and fixed at the root:** the FaceGen neck gate wrote a hardcoded `0.0` and **could not fail** (now re-measured post-snap, ~1e-6 across all 20); eyes/mouth/brows claimed the torso slot so any cuirass blanked out the face (the `32` was pyNifly synthesising a default for unpartitioned shapes, then the neck stitch copied it onto the head at half weight magnitude); slot numbers were folded `% 100`, mapping NECK onto HEAD (now a shared section-cap table, `blender/biped_slots.py` -- latent in the armour set, no piece's slots changed); and the fitted hurtbox was male-only while the female measurement was **already being taken and discarded** -- female Spine0 is 17.8% narrower and the pelvis 8.5% wider, so it now ships per sex (`hurtbox.<sex>.segments`, male numbers byte-identical). The support envelope stays shared: `soleMarkerMinZ` is bit-identical between the sexes. **The head-to-armour collar gap is separate and also fixed** ([0055](decisions/0055-a-collar-overlaps-the-neck-rather-than-meeting-it.md)). Armour rebuilt per sex and per weight 2026-09-11 ([0056](decisions/0056-armour-is-blended-to-the-wearer-not-deformed-to-fit.md)). Owner review pending: the two female sheets, the new picker, and the armour collar sheet. |
| 10b — full portable-sandbox parity in studio (was 7b; moved 2026-08-25, decision 0017) | todo | Scene orchestration extraction (§53), inventory/equipment UI, enemies/targeting, bow, navmesh; combat-space probes then validate + freeze the 11/12 exemplar packets; **incl. fixes to shared combat internals** (owner 2026-08-29: good-enough, not perfect — specifics at kickoff) |
| T — text quality (parallel workstream, decision [0043](decisions/0043-text-quality-workstream.md)) | done | done 2026-09-03: docs/text/ shelf, style guide, 8 culture registers, review process (0043). British spelling |
| S — stats, progression and character-systems **design** (parallel workstream, module 76; decision 0019) | done | done: four owner rounds closed (0031/0033/0035/0037); module 76 §116-129; tooling/stats-sim holds 19 invariants |
| 10c — stats and progression implementation (module 76; decision 0019) | todo | Implements workstream S in `packages/game-core` incl. the semantic-authoring compiler (ladder refs → numbers; extended to loot/traps). After 10b, **before packet freeze and Phase 13** — content in 11/12 authors semantically without it (0019 4th amendment; 0034) |
| 13 — fauna ecology, encounters, fixed loot (exemplar-first; flora half moved to Phase 10 by 0034) | todo | |
| 12b — province soundscape (module 57; polish tier — 0023, hardened by 0034) | todo | runs in the P window **after 13** (authors creature calls/ambience *from* the ecology data); must land before 14 locks budgets; may pull earlier |
| P — general polish pass (rolling backlog, added 2026-08-28) | in progress | Water round 2 ([0047](decisions/0047-water-one-physical-model.md), [evidence](research/rendering/water-round2-evidence.md)) delivered and deployed 2026-09-09; the owner's review found it visually regressed in places, so the water, terrain, chain, route and vegetation rows of [polish-backlog.md](polish-backlog.md) are absorbed into Phase 16 (its plan §9 lists them). What remains in the backlog is genuine polish |
| **16 — frozen foundation and place ladder** (0057; owner 2026-09-11) | **next: `deliver 16a`** | Plan: [phases/16-foundation-and-places/README.md](phases/16-foundation-and-places/README.md). Chunks 16a hydrology graph + gates + docs · 16b terrain once · 16c water once · 16d border apron · 16e routes/grading/spans/ferries · 16f vegetation · 16g macro plot (places adapt) · 16h settlement runtime + kit QA · 16i exemplars end to end · 16j rollout skill + trial packet. One fresh agent per chunk, owner check between. 16a needs no owner ruling; 16b needs rulings 1–6 (plan §7) |
| 14 — streaming and deployment | todo | |
| 15 — rollout by region packet (recast from "expansion by watershed" by 0034) | todo | opens by drafting the packet roadmap for owner sign-off |

## Waiting on user

**Phase 16 is planned, 2026-09-11** ([plan](phases/16-foundation-and-places/README.md),
[0057](decisions/0057-phase16-terrain-once-water-once-places-on-a-frozen-world.md)).
Start with `deliver 16a` — it needs nothing from you. Before `deliver 16b`,
give the thirteen rulings in the plan's §7 (each has a recommendation; "go
with the recommendations" is a valid answer) and approve or amend the
visual-ingestion and kit QA proposal in §8. The five audits behind the plan
are in `docs/research/phase16/`; the headline findings are in the plan's §1.

**Female characters are playable, 2026-09-10** ([0054](decisions/0054-sex-is-an-axis-not-a-second-set-of-races.md),
[0055](decisions/0055-a-collar-overlaps-the-neck-rather-than-meeting-it.md)).
Ten races x two sexes, twenty built bodies, all from vanilla assets. To judge:

- **The ten default women** — [current-defaults-female.png](evidence/races/current-defaults-female.png).
  Name any race whose face does not read as a believable person of that race.
- **The ten alternates** — [race-valid-variants-female.png](evidence/races/race-valid-variants-female.png).
  Not shipped; say if you prefer one to a default and it gets swapped.
  **No female Elf hairstyle has ever been visually assessed** — the male reject
  list does not carry across (different meshes). This sheet is what decides
  whether a female list is needed.
- **Fighting as a woman.** `npm run dev -w @elder-souls/combat-sandbox`. The
  hit area now matches the female body (chest 17.8% narrower, hips 8.5% wider)
  instead of reusing the male one. Male numbers are byte-identical, so male
  feel cannot have moved. Nobody has swung at a female character yet.
- **The picker.** Two open calls, both cheap now and annoying later:
  should flipping male/female keep the same race, and should the grid show a
  face rather than a name?

**Armour now fits both sexes, 2026-09-11** ([0056](decisions/0056-armour-is-blended-to-the-wearer-not-deformed-to-fit.md)).
Every piece ships as Skyrim's own male and female meshes, blended to the
wearer's body weight, so women no longer wear men's maximum-weight armour.
Judge it on the eighteen collar cards in
[armour-neck-check.png](evidence/races/armour-neck-check.png): any magenta is a
hole. Three cuirasses (elven, dwarven at low female weight, ebony male at low
weight) still measure a few millimetres short at the collar without showing a
hole; they are queued in the polish backlog with their causes.

**Air polish round 3 is in, 2026-09-11.** Fireflies stay below eye level and
gather in ground-anchored pockets; dragonflies are held 9 m out so a knot is
something you walk into, never something that appears in front of the camera;
pollen keeps a whisper of presence away from the sun. Judge it on a marsh walk
at dusk and at noon.

**The province is deployed and walkable, 2026-09-09.** The full handoff — what
changed, what to judge, and a studio URL per site — is
[research/phase11/walkthrough-2026-09-09.md](research/phase11/walkthrough-2026-09-09.md).
Headlines: buildings stand in the world for the first time (10,441 placed
pieces); the vegetation ladder is delivered and the jungle is genuinely the
densest canopy; settlements clear their own vegetation; places are spaced to the
owner's "evener than random" steer; six systems that were guessing where water
is now measure it. **This build has NO road grading** — an owner trial: roads
take the natural ground with built pieces where it is too steep, and the
question is whether a road still reads as a road.

**Named and not hidden**, all in the deployed build:
- **The buildings render again — FIXED 2026-09-09, not yet redeployed**
  ([0052](decisions/0052-a-published-bundle-obeys-the-runtime-contract.md)).
  Two independent defects stopped `SettlementLayer` drawing anything; both are
  fixed at the root, and the fix is proved in a browser against a local build
  of the new bundle (Mazzatun: 3,209 placements drawn, 169 draws, 1.8 M
  triangles, HUD intact, zero page errors).
  1. `colliderPartBudget` was **256**, a placeholder literal never calibrated
     against a real settlement, and Lilmoth's residents need **1,033** parts.
     Now **1,600**, measured, with its derivation recorded beside it.
  2. `KitShelf.locate` scanned every built kit alphabetically, so the throwaway
     sourcing probes `probe-enclosure`/`probe-gapfill` — built with one
     `lodRatio`, so a two-tier LOD chain — beat the shipping kits to assets
     those kits also hold. `validateLodTriangles` then threw from inside the
     draw effect, uncaught, taking the studio's whole React tree with it (that
     is why the `markers` checkbox vanished). `KitShelf` now offers only assets
     that can satisfy the three-tier contract, and the layer's own throws are
     caught into its own failure sentinel instead of unmounting the host.

  The general lesson is recorded in 0052: **every contract the runtime enforces
  now has an export gate that reads the shipped GLB** (LOD chain, texture cap,
  collider budget), and the owner's `--ship-with-errors` override **cannot
  waive a runtime-fatal error class** — waiving one is what shipped a build in
  which nothing drew at all.
- ~~Long spans are a chain of 4.2 m slabs with no piers.~~ **Fixed, then most of
  them deleted — ready to walk, 2026-09-09.** A viaduct kit (the set of proper
  bridge parts: piers, arches and a roadway) was wired into the build.
  Measuring the result found the real defect underneath. Of the 204 bridges standing at that point,
  192 had nothing beneath them to cross: no water, no gap. The worst was a
  chain of 126 roadway pieces running straight down a dry hillside. Nothing in
  the build had ever asked whether there was a gap there in the first place. It
  does now. Each bridge is trimmed back to the stretch that has either standing
  water deeper than 0.3 m in the wet season, or ground that drops more than one
  roadway thickness (1.479 m, measured from the kit's own parts) below the
  line that the road wants to hold. A bridge with no such stretch left is deleted.
  **Bridges 205 → 97, total bridge roadway 16,712 m → 3,069 m, the longest
  bridge in the province 389.6 m → 108.2 m**. The shipped world carries 4,225
  bridge pieces where there were 9,708. Roads that lost a bridge get their road surface
  painted back on the ground: 4,994 m of main road and 3,084 m of track and
  path, which the bridges had been covering. Each bridge also carries a
  one-line explanation of why it is there. Thirteen of those lines described
  rock sills, border ridges and field walls that the ground does not actually
  have; they are rewritten to match what was measured (standard 12). Proved in a browser at all
  six crossings plus Mazzatun and Lilmoth: every one draws, no layer failure,
  HUD intact. Six exemplars, one per span system, in the deployed studio
  (`https://jtattersall09403.github.io/elder-souls-argonia/studio/`) — full
  list with what to look for in
  [research/phase11/walkthrough-2026-09-09.md](research/phase11/walkthrough-2026-09-09.md).
  Headline three: the **Nine-Trunks viaduct**
  `?view=character&x=4.517&z=3.608&t=12:00` (75.5 m over 1.4 m of water), the
  **Xul-Vaat walkway** `?view=character&x=1.203&z=5.730&t=12:00` (101.5 m, the
  longest span left) and the **reformed Blackwood road viaduct**
  `?view=character&x=0.849&z=3.181&t=12:00` (389.6 m of deck over nothing, now
  52.6 m over a real 2.0 m drop).

  Rules and rejects: [decision 0051](decisions/0051-route-span-systems.md);
  the measurement and its derivation:
  [research/world-terrain/route-spans-and-crossing-costs.md](research/world-terrain/route-spans-and-crossing-costs.md).
- **Water crossings are now measured, and ferries are decided** (2026-09-09).
  The old "57 (45 lake, 12 river)" was not reproducible from any script,
  report or bake — `git log -S` finds only the docs quoting each other, and
  its lake/river split was inverted against the water compiler's own cell
  counts. Replaced by `python3 -m worldgen.water_crossings`, which re-derives
  it in a minute: **52 on the major network (31 river, 21 lake)** and 63 on
  tracks, table in [world/sources/sites/water-crossings.md](../world/sources/sites/water-crossings.md).
  The deepest crossing in the province is **1.48 m**, so depth never stops
  anyone and span decides: **41 of the 52 are fords under 20 m and stay
  fords**, 6 are 20–70 m and are deck-on-posts work for the span kit, and 5
  clear 70 m. Those 5 are three clusters, and each becomes **one ferry**:
  the basin under Helstrom, Gideon's bonded crossing on the Onkobra, and the
  seasonal ferry at the Drowning Gate. With the four existing station runs
  the graph is [world/sources/routes/ferry-crossings.json](../world/sources/routes/ferry-crossings.json)
  (6 active, 1 deferred), gated by `worldgen.ferry_crossings --check`.
  **Not yet placed**: nothing renders until a later agent runs the settlement
  chain — see that file's `craft` note and the polish-backlog rows for
  `watercraft-v1`, which is built but reaches no compiled place, and for the
  missing placeable-NPC record type that talk-and-teleport needs.
- Two placement checks are red behind a dated `continue-on-error` in
  `.github/workflows/deploy-pages.yml`, which names them and says to delete it
  when they pass.

Earlier rounds still open for a look, none blocking: measured weapon reach and
the distinct FaceGen races (0040); the water round-2 evidence ledger
([research/rendering/water-round2-evidence.md](research/rendering/water-round2-evidence.md));
the 6b terrain-feel re-check bundled into the 8b close; and the 8c leftovers the
owner will record themselves in [polish-backlog.md](polish-backlog.md).

(There is no "next up" section: the first `todo` row above is what's next.
Phase-ordering rationale lives in the plan §86, not here.)
