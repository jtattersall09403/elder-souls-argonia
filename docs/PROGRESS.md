# Build progress

Single source of truth for where we are in the build sequence
([docs/phases/README.md](phases/README.md) §86). Read this file first, then
open only the plan sections the active phase needs.

## Protocol (all agents)

1. **Trust the repo over this file.** Before building on a phase marked done,
   spot-check its evidence (run the gates, check `git log`). Run `git status`
   first: a dirty tree means a previous agent stopped mid-work or another
   agent is working now (commit by pathspec; never revert their files).
2. **Starting work:** in one commit *before* the work itself, set the row to
   `in progress` with a one-line current task and rewrite *Waiting on user*
   to match. The first `todo` row in the queue is what is next; there is no
   separate "next up" section.
3. **Work in small commits.** `npm run preflight` once before each commit.
4. **Finishing a milestone:** flip the row to `done` with one line of
   evidence, in the same commit as the finishing work, and refresh
   *Waiting on user*.
5. **Crash recovery:** if a row says `in progress` and no agent is running,
   use `git status`, `git log -5` and the gates to decide whether to finish,
   redo or revert the partial work; then correct this file.
6. **Keep this file under ~80 lines.** One line per row. Handoffs, evidence
   and round narratives live in `docs/decisions/`, the phase folders and
   `docs/research/`; link them, never paste them.

## Status (execution order; decision 0062 fixed the queue on 2026-09-13)

| Milestone | Status | Evidence / current task |
|---|---|---|
| 0–8c — sources, monorepo, province, hydrology, society, studio, terrain, character, light, water, weather | done | decisions 0001–0032; phases README §86.1; water and weather closed "good enough" (0025, 0032) |
| L, N, T, S, C — lore, quest review, text, stats design, combat workstreams | done | 0018/0026/0030 (N), 0043 (T), 0031–0037 (S), 0040/0054–0056 (C: 20 built bodies; the female sheets, the collar cards and the round-9 calls all closed by the owner 2026-09-18) |
| 10 — asset deep catalogue, kits, vegetation machinery | done | owner CLOSED 2026-09-04; [0036](decisions/0036-phase10-placement-decisions.md); density ladder [0048](decisions/0048-vegetation-density-ladder.md) |
| 11 — settlement/location system | absorbed into 16 (0057, 0061) | where each deliverable went: phases README § Phase 11; history [0041](decisions/0041-phase11-settlement-decisions.md) |
| **16 — frozen foundation and place ladder** | **in progress: 16a accepted 2026-09-11; 16b round 2 delivered 2026-09-12 (0060); 16c round 2 delivered 2026-09-14 ([0064](decisions/0064-waterfalls-are-the-vanilla-kit.md) falls, [0065](decisions/0065-the-compile-realises-the-graphs-classification.md) the graph is the classification; [round-2 ledger](research/phase16/16c-round-2-ledger.md)), owner walk pending; 16d delivered 2026-09-15 and **accepted by the owner 2026-09-15** ([0067](decisions/0067-the-apron-is-the-tamriel-map-at-one-to-one.md), [ledger](research/phase16/16d-ledger.md); leftovers go to the polish backlog as the owner records them); 16e delivered 2026-09-15, round 3 delivered 2026-09-16 ([0068](decisions/0068-routes-below-the-gate-records-here-realised-in-16h.md), [0069](decisions/0069-the-road-network-is-six-legs-and-two-exits.md), [ledger §2d](research/phase16/16e-ledger.md)), owner walk pending; 16f delivered 2026-09-16 ([0070](decisions/0070-vegetation-and-dressing-read-the-record.md)), round 2 delivered 2026-09-18 ([0071](decisions/0071-every-placed-thing-steps-down-through-bands-and-collides-as-itself.md)), round 3 delivered 2026-09-18 ([0072](decisions/0072-the-ring-fades-in-the-shader-and-the-studio-serves-files-from-disk.md), [ledger §16](research/phase16/16f-ledger.md)), round 4 delivered 2026-09-18 ([0073](decisions/0073-one-copy-per-pixel-a-card-is-baked-from-its-own-mesh-and-the-writer-is-not-the-rule.md), [ledger §17](research/phase16/16f-ledger.md)), **round 5 delivered 2026-09-18** ([0075](decisions/0075-lod-is-a-ladder-stepped-from-the-camera.md), [ledger §18](research/phase16/16f-ledger.md)), owner walk pending; **16g delivered 2026-09-19** ([0078](decisions/0078-places-adapt-to-the-frozen-world.md), [0080](decisions/0080-the-chain-runs-by-dependency-not-position.md) the chain by dependency, [ledger §3](research/phase16/16g-ledger.md), [remedy plan](research/phase16/16g-remedy-plan.md); 567/580 sited, 13 in the accepted-homeless register), owner check pending; owner walk 2026-09-20 done; follow-up round delivered ([ledger § State](research/phase16/16g-ledger.md)); **16h/16i/16j briefs rewritten as a set 2026-09-20 ([0081](decisions/0081-building-blocks-then-exemplars-then-rollout-and-doors-are-transitions.md): two, three and two parts, an owner check-in after each); the [vegetation renderer lane](phases/lanes/vegetation-renderer-lane.md) runs first and must close before 16h starts (owner 2026-09-20); next: "deliver 16h part 1"** | [plan](phases/16-foundation-and-places/README.md); 16a [0058](decisions/0058-the-hydrology-graph-is-the-water-record.md); 16b [0059](decisions/0059-terrain-built-once-frozen-base-and-typed-patches.md), [0060](decisions/0060-rivers-reach-the-coast-profiles-are-graded.md), [ledger](research/phase16/16b-terrain-once-ledger.md); then 16c water · 16d apron · 16e routes/ferries · 16f vegetation (+ submerged band) · 16g plot (+ promise vocabulary) · 16h runtime + kit QA · 16i exemplars (tier A interiors) · 16j rollout skill + trial packet |
| 9 — swimming, climbing, boats (movement only) | todo | chunks 9a thin swim (first after 16j), 9b boats, 9c climb; briefs written by the "chunk Phase 9" job at 16j close (0062) |
| 10b — sandbox parity in the studio + the renderer extraction | todo | scene orchestration and `packages/world-render` extracted in one pass (0062); navmesh chunk may run as soon as 16h lands; shared-internals fixes per the owner's kickoff list (0017) |
| 10c — stats and progression implementation | todo | implements workstream S in `packages/game-core` incl. the semantic compiler (0019); chunk briefs written at 10b close |
| 13 — fauna ecology, encounters, fixed loot | todo | data-model chunk written now; the rest at 10c close (0062) |
| 12 — interiors: research, the furnishing mine, the skill proved on exemplars | todo | every assembled interior (dungeons and tier B buildings) against the promises 16g/16j/15 author with the places (0062); research chunk written first |
| 12b — province soundscape | todo | after 12 and 13, before 14 locks budgets (0023, 0034); supporting chunks may fill the P window |
| P — general polish pass (rolling) | in progress | [backlog](phases/P-polish/backlog.md); the terrain/water/vegetation/route/settlement rows were absorbed into 16 (0057) |
| 14 — streaming and deployment (budgets, chunk format, impostor audit) | todo | the renderer extraction moved to 10b (0062) |
| 15 — rollout by region packet, one pass per packet | todo | opens from the roadmap 16j drafts (`docs/phases/15-rollout/`); the 16j trial packet is packet one; major cities and the opening-scene places are owner-guided (0062) |

## Side lanes (decision 0074; rules in [phases/lanes/README.md](phases/lanes/README.md))

| Lane | Status | Evidence / current task |
|---|---|---|
| Weapons — every kept class with its own motion, effects slot, skill inputs, sandbox picker, landing | in progress: rounds 0 and 1 delivered ([0076](decisions/0076-weapons-lane-round-0-effects-slot-skill-inputs-and-skyrim-calibrated-tables.md), [0077](decisions/0077-weapons-lane-round-1-animated-armoury-movesets-and-meshes.md)); round 1b delivered 2026-09-19 (katana pack + moveset, 11 cleared-mod weapons, OBJ meshes on the hand-node convention; 0077 §5); owner playtest of rounds 0–1 pending (§ Waiting on the owner); next: "deliver weapons round 2" | [brief](phases/lanes/weapons-lane.md) |
| Vegetation renderer — cells built once, LOD on the GPU, no rebuild on movement | planned 2026-09-20; next: "deliver vegetation renderer round 0"; must close before "deliver 16h part 1" | [brief](phases/lanes/vegetation-renderer-lane.md) |

## Waiting on user

- **16f round 5 delivered 2026-09-18, walk pending**
  ([0075](decisions/0075-lod-is-a-ladder-stepped-from-the-camera.md),
  [ledger §18](research/phase16/16f-ledger.md)): start the studio and walk
  § Owner check, round 5 in the
  [brief](phases/16-foundation-and-places/16f-vegetation-on-frozen-water.md) —
  trees, palms, plants and rocks stepping cleanly on approach, the camera
  swing, water reflections and the HUD frame rate with the preset name.
- **Weapons lane rounds 0 and 1** ([0076](decisions/0076-weapons-lane-round-0-effects-slot-skill-inputs-and-skyrim-calibrated-tables.md), [0077](decisions/0077-weapons-lane-round-1-animated-armoury-movesets-and-meshes.md)): the playtest in the combat sandbox (skill sliders and curves box, class effects, the new speeds; pike, spear, halberd, quarterstaff, rapier and claw in your hands and in the new opponents' hands), the katana, the tridents and half-pikes and the five Black Marsh weapons (bone dagger, great cleaver, obsidian warhammer, jagged katana, ball club) sitting right in the hand, plus two calls: sign the speed table; say whether the curves should be on when the sandbox starts.
- **16g walked by the owner 2026-09-20; all four calls given and closed by the follow-up round the same day** ([ledger § State and § Owner calls](research/phase16/16g-ledger.md)) ([0078](decisions/0078-places-adapt-to-the-frozen-world.md), [0080](decisions/0080-the-chain-runs-by-dependency-not-position.md), [ledger §3](research/phase16/16g-ledger.md), [remedy plan](research/phase16/16g-remedy-plan.md)): the 2D map (`?cat=1`) and the ledger, per § Owner check in the [brief](phases/16-foundation-and-places/16g-macro-plot-places-adapt.md). The four calls as given: (1) the pirate-freeholds zone stays and its prose was adjusted; (2) Blackrose's centre goes onto the island in its lake, in 16h's city pass; (3) the stronghold is Rockpoint and the Empty Steading was cut; (4) the thirteen unsited records were cut and 48 quests re-pointed off them.
- **16h/16i/16j plans reviewed as a set (2026-09-20, decision
  [0081](decisions/0081-building-blocks-then-exemplars-then-rollout-and-doors-are-transitions.md)),
  a read before "deliver 16h part 1"**: each brief's § The story.
  16h now designs no place (two parts: kit truth; the machinery proven on
  the road exemplars); 16i designs six places on paper first (three
  parts); 16j runs the recipe unattended (two parts). Two facts for you:
  the shipped track-clearance receipt from 16g reports zero plants
  removed (16h part 1 diagnoses it); adding scatter as a local patch does
  not exist yet (16h part 2 builds it). The 16g calls above are applied
  at the start of 16h part 1.
- **Nothing else blocking (owner 2026-09-18):** the 16b–16e owner walks, the
  female character and armour sheets (0054/0056) and the workstream C round-9
  calls (0040) are all closed. 
- **Earlier evidence still open for a look, none blocking:** the water round-2
  evidence ledger ([archive](research/archive/water-round-2-2026-09/water-round2-evidence.md));
  the 8c leftovers the owner records in the backlog. The 2026-09-09
  walkthrough of the deployed province is archived at
  [research/archive/phase11-rounds/walkthrough-2026-09-09.md](research/archive/phase11-rounds/walkthrough-2026-09-09.md);
  its settlement findings are the 16h work.
