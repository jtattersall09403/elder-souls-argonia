# Engineering standards

Eighteen standing rules that are **cheap to require now and brutal to retrofit**.
Adopted by the owner 2026-09-01 (decision
[0042](../decisions/0042-buildout-steers-and-engineering-standards.md) §8) after
the lesson of the renderer: the code that has to be true of *everything* must be
made true from the first line, not converted later.

Each rule states **what**, **why**, **how it is enforced**, and **who owns it**.
Enforcement is one of:

- **check** — mechanical, runs in `npm test` from the repo root
  (`tooling/repo-standards`); a violation fails the build;
- **rule** — binding on agents, verified by review at the named phase kickoff;
- **hook** — a contract or data field an owning phase must leave behind (these
  also appear as rows in [game-buildout-register.md](../phases/buildout/README.md)).

---

## 1. The typed condition/action vocabulary exists before content is authored

**What.** Every quest gate, faction check, reward grant and world-state change is
written in one typed vocabulary. It was authored *before* the places were sited (Phase 11, now 16g and the 16k place loop) and
anything.

**Why.** This is the packages mistake about to repeat. The vocabulary is
mandated everywhere in the quest plan and enumerated nowhere; the only extant
list (76 §125, 8 predicates) cannot express stage, journal, topic, evidence,
custody, time or tier-lock gates. Content authored against ad-hoc prose
conditions has to be hand-translated later, hundreds of times.

**Enforcement.** rule. First cut authored:
[quests/85-condition-vocabulary.md](../quests/85-condition-vocabulary.md). It is a
living document — an author who needs a predicate that does not exist **adds it
there** rather than inventing prose. The Q1 gate (quests 90) checks that every
authored condition names a listed predicate.

**Owner.** Authored now; extended by place and interior authoring (16g, the 16k place loop, Phase 12, Phase 15); implemented in
build-out G2 (`narrative-core`).

## 2. Stable IDs, and a registry, from the first placed object

**What.** Everything placeable or referenceable carries a stable, human-readable
ID that never changes: settlements, POIs, dungeons, interiors, sockets, NPCs,
factions, quests, items, Hist trees, water bodies, travel services. IDs are
registered in one place per domain and never reused after deletion.

**Why.** A save file and a quest flag both point at "that door" forever. An ID
that shifts when a file is regenerated silently breaks saves and quests.

**Format.** `<domain>.<packet>.<name>` in lower kebab, e.g.
`poi.murkmire.drowned-stair`, `npc.lilmoth.never-writes-twice`. No spaces, no
capitals, ASCII only. Retired IDs go to a `retired` list, never deleted.

**Registered families** (`tooling/repo-standards/id-registry.json`, 2026-09-27):
the place catalogue (places, design groups), quests and questlines, the
registries (factions, creatures, items, deeds, rumour pools, NPCs), the route
registry and route structures, candidate sites, and the Claywater Station
layout, whose socket and route ids must match
`^(socket|route)\.claywater-station\.` (a source's `idPattern`; a layout is the
home table of its place's sockets, decision 0104). Promise ledgers, doors,
blueprints and travel services are checked by the integrity gate (standard
18); each new layout joins the registry with its own row.

**Enforcement.** check — `repo-standards` asserts ID shape and global
uniqueness across every registered data file, a source's `idPattern` and
no id defined twice inside it, and that no retired ID is reused.

**Owner.** Phase 11 onwards for placement; the check is live now.

## 3. Ownership and value ship *with* placement

**What.** Every placed interactable may carry `owner` / `ownerFaction` and a
value tier at the moment it is placed. Unowned is the wilderness norm — the
field is optional, but the *opportunity* to set it is not deferred.

**Why.** Retrofitting "who owns this crate" across a province is the expensive
version; the Morrowind-visibility theft model (0039) depends on it.

**Enforcement.** hook (homed in 16i by 0062, carried into the 16k backlog under its 16i number by 0099; already a register row).

## 4. One text catalogue; every player-visible string has an ID

**What.** No player-visible string is a literal in a component or a data file.
All of it lives in `packages/text-catalogue`, keyed by ID, with the speaker or
surface recorded.

**Why.** Three payoffs, none of them localization (which stays out of scope):
the **voice review** (0042 §6) can sweep one catalogue instead of grepping the
codebase; a glossary and newcomer-topic coverage check (quest Q0 gate) become
trivial; and consistency of terminology across hundreds of thousands of words
stops being a matter of memory.

**Enforcement.** check — the catalogue's own tests assert ID shape, global
uniqueness and no duplicate *text* under different IDs (the tell of two agents
writing the same line twice). New UI and content code uses the catalogue;
existing sandbox/studio debug UI is exempt (debug strings are not player-facing)
and is not retrofitted.

**Player-facing, defined** (owner 2026-09-21, final): any string that will
appear in the game **or in any of our apps** — world-studio, combat-sandbox,
anything built later — the studio's review panels included. So the world
records are player-facing too: place `why`/`vibe`/`hook` fields and notes,
quest rows, blueprints, routes and registries. The prose linter (standard 14)
walks `packages/text-catalogue` and `world/sources` in full, with reasoned
exemptions only; `docs/**` is excluded.

**Owner.** Live now; every text-producing phase from 11 onwards.

## 5. The quest runtime is headlessly drivable from day one

**What.** `narrative-core` is built so a whole playthrough can be simulated with
no renderer, no input and no clock — conditions evaluated, stages advanced,
endings computed.

**Why.** It is the only way we ever verify three endings, tier protection and
fail-forward successors without playing to the end three times. Bolting
headlessness onto a runtime that assumed a scene is a rewrite.

**Enforcement.** hook, asserted at the `narrative-core` kickoff: the first test
written for the quest engine is a headless run of the exemplar quest.

**Owner.** build-out G2.

## 6. Determinism in world building

**What.** No wall-clock time and no unseeded randomness anywhere in world
generation, compilation or placement. Every random draw takes an explicit seed
derived from stable inputs (chunk coordinates, packet ID, object ID).

**Why.** Reproducibility is the whole basis of our evidence: a probe result, a
placement audit or an owner playtest means nothing if the next run differs.

**Enforcement.** check — `repo-standards` rejects `Math.random`, `Date.now` and
argless `new Date()` in the world-generation and world-data code paths. Test
files and explicitly-annotated runtime jitter are exempt via a narrow allowlist.

**Owner.** Live now.

## 7. Every data bundle carries a `schemaVersion`

**What.** Every generated or authored data file that the game reads at runtime
carries a `schemaVersion` integer at its top level, bumped whenever the shape
changes incompatibly.

**Why.** Save migration is impossible without it. Later is too late: a bundle
shipped without a version is a bundle we cannot tell apart from its successor.

**Enforcement.** check over a declared registry of runtime data paths
(`tooling/repo-standards/data-registry.json`). New runtime data paths are added
to the registry when created; the check fails if a registered path contains a
file with no `schemaVersion`.

**Owner.** Live now, forward-looking; historical bundles are versioned as their
owning phase next touches them.

## 8. No new module-level mutable singletons in `packages/`

**What.** Shared packages export functions, classes and types — not mutable
module-level state. Anything that needs shared state takes it by injection.

**Why.** This is the *specific* thing that made the renderer hard to extract:
sky, water, weather and terrain are a five-way import cycle coupled by
`sharedAerialUniforms`, `worldClock`, `wetnessUniforms` and friends. The golden
rule already forbids it; a rule without a check rots.

**Enforcement.** check — `repo-standards` flags new module-level `let`/`var`
exports and mutable exported object literals in `packages/`. Existing violations
are listed in the check's baseline file and must **shrink, never grow**; the
check fails if the baseline is exceeded. The same check forbids
`import.meta.env.DEV`/`PROD` anywhere under `apps/world-studio/src`: the
studio is the owner's own tool, deployed and local builds must be identical,
and gating on the build mode there is a defect (owner 2026-09-22) — use
`STUDIO_TOOLS` from `apps/world-studio/src/studioTools.ts` instead;
dev-only gating belongs in the game app.

**Owner.** Live now.

## 9. The creature/actor statblock schema precedes creature placement

**What.** The actor schema (statblock class, Fight/Flee/Alarm ints, overlay and
state flags, faction, territory) is settled before Phase 13 places a single
creature.

**Why.** Same shape of problem as ownership: fields added after placement mean
touching every placed thing.

**Enforcement.** hook — by 10c, already a register pull-in (cross-check §1).

**Owner.** Phase 10c; consumed by 13.

## 10. Asset provenance: source, hash and credit in the same change

**What.** No sourced asset lands without its source URL, file hash and a credit
line in root `README.md` § Credits — in the same change, not the same quarter.

**Why.** The credits review keeps re-finding gaps, which means the rule alone is
not working. A mod credited only in a pipeline audit doc is a gap the next
review has to re-find.

**Enforcement.** check — `repo-standards` asserts every Nexus/asset source URL
referenced by a pipeline kit config appears in the root README credits.

**Owner.** Live now.

## 11. One content-unit convention

**What.** Letters, rumours, books, notes, journal entries, dialogue lines and
barks are all **typed content units** of one shape: stable ID, type, text
catalogue reference, availability conditions (standard 1's vocabulary), and the
world state they key off.

**Why.** The narrative machinery then reads one format instead of seven, and the
validators, the voice review and the discovery feed all operate on one table.

**Enforcement.** rule; the shape is defined in
[quests/85 §C](../quests/85-condition-vocabulary.md).

**Owner.** Defined now; authored from Phase 11; runtime in build-out G2.

---

## 12. Prose is written against the record, and checked against it

**What.** Any free-text field that describes something the game will have to
show or do (a place's `why`/`vibe`/`hook`, a creature note, an item
description, a quest brief) is written *from* the typed fields beside it —
`assetPlan`, `interior.family`, `contents`, `sitingPrefs`, `plotFacts`, the
registries — and never promises anything those fields cannot deliver. A
built form, creature, item or landform named in prose must resolve to a kit
family, a registry entry with `assetAvailability ≠ none`, or a landform the
plot actually gave the record. When prose and data disagree, the data is
fixed or the prose is rewritten in the same change; the disagreement never
ships.

**Why.** The Phase 11 catalogue validated every record's kit list and every
id, and still promised root galleries, cliff dwellings, insect swarms and
sightlines that nothing could build (owner finding 2026-09-04). Validators
see fields; they did not see the sentences. The class of failure is general:
whenever a typed record grows a prose neighbour, the prose drifts from the
data unless writing it *starts* from the data and a check reads it back.

**Enforcement.** rule for the writing agent (the brief for any prose pass
names the fields it must be written against); the prose linter walks every
world record under `world/sources` on `npm test`, because a world record is
player-facing text under the owner's 2026-09-21 definition (standard 4);
mechanical where a lexicon exists — `worldgen.audit_place_semantics` (prose vs ground) and the
built-form/creature noun scan of
[research/placement-settlements/place-asset-deliverability-audit.md](../research/placement-settlements/place-asset-deliverability-audit.md)
(prose vs kits and registries), both run in the Phase 11 QA gate; the text
review (docs/standards/text/review-process.md §3) checks fact-against-record as its
last step.

**Owner.** Defined 2026-09-04; applied to the place catalogue in the same
round; every later register (creatures, items, quests, dialogue) inherits it.

---

## 13. The placement lesson moves with the placement work

Owner ruling 2026-09-05: the workflow record is kept by a mechanism, not by
memory. If a blueprint, a design record or a placement tool changes and no
lesson record does, `npm test` fails. Placement work is a blueprint
(`world/sources/blueprints/place.*`), the lane-terminal, route-structure and
kit-assembly records, the placement code in `worldgen` (`blueprint*.py`,
`compile_settlement.py`, `street_router.py`, `apply_sitings.py`,
`export_blueprints.py`, `render_blueprint.py` and the rest of the list in
`check.mjs`), the kit builder, the workbench (`tooling/placement-workbench/**`)
and the place skill (`.claude/skills/place-build/**`). The records that satisfy
it are the skill's lessons store
(`.claude/skills/place-build/references/lessons/`, the operative one,
decision 0100 decision 4), [world 97](../world/97-placement-principles.md) and
decision 0041; [world 96](../world/96-placement-playbook.md) stays accepted
for edits to its history. A merged lesson row is enough; the point is that no
round ends without its lesson written where the next designer reads it.
**Checked mechanically** (`tooling/repo-standards/check.mjs`, standard 13, via
`git status` and the commits since the base; `node check.mjs --standard13
<paths>` judges a given changed-path list).

## 14. A gate reads shipped data and has been seen to fail

Owner rulings 2026-09-07 and 2026-09-11 (Phase 16 plan §3): in one week three
gates were found that could not fail on their own defect. So:

- a gate reads the **shipped** artefact (the committed JSON, the published
  raster, the built GLB), never a fixture that stands in for it;
- the commit that adds a gate shows it **failing** on a real or injected
  defect (a corrupted copy of the shipped data is fine) and the test file
  keeps that demonstration;
- probes **report** and tests **assert**; a probe that prints a number nobody
  compares is not a gate;
- images are read in **render rounds** (decision 0100 decision 2): one
  Blender launch per round (the top view, one front per building, two isos),
  read by one Sonnet reader against the place skill's reader checklist, at
  most **four rounds** before the walk packet; the 2.5 s plan render and its
  reader pass come first. Images come only from tooling that renders to a
  file, only for a check a number cannot express; the report lists each
  round with what it decided.

Checked mechanically where it can be: the hydrology graph (`worldgen
.hydrology_graph check`, decision 0058) and the player-text prose
linter (`lint_prose`, owner 2026-09-21) run in `npm test`; their failure
demonstrations are `test_hydrology_graph.py` and `test_lint_prose.py`. The
prose linter lints by **exclusion** over two roots walked in full,
`packages/text-catalogue` and `world/sources`: every prose-looking string (≥6 words, or sentence punctuation with ≥3) is in scope, so a new kind of text (dialogue, item descriptions, book text, signs) is linted the day it exists, with no list to maintain. World records are player-facing under the owner's 2026-09-21 definition (any string shown in the game or in any of our apps, the studio's review panels included), so catalogue why/vibe/hook fields, quest rows, blueprints, routes and registries are all walked; `docs/**` is not. The only way to skip a string is a key or a path listed in `lint_prose.py` **with its reason** (`EXEMPT_KEYS`, `EXEMPT_DIRS`, `EXEMPT_FILES`, `EXEMPT_NAMES`). A tripwire (`lint_prose --tripwire`, run by the standard-8 check in `check.mjs`) fails on prose data elsewhere under `packages/` or `apps/*/src/`. `lint_prose --file <path>` checks one file as it is written; a post-edit hook runs it on every edit under the two roots.

## 15. Live documents are current: links resolve, retired words are gone, research is indexed

Owner 2026-09-13, after three read-only audits found the same disease across
the docs: a router row pointing at a description of a retired system, a
deleted script still recommended, three counts for one list, phase names
kept alive after the phase was absorbed. The judgement half of the cure is
the `routing-audit` step (docs/README.md § Where to record); this standard
is the mechanical half:

- every relative markdown link in `docs/`, `world/`, `.claude/` and the root
  resolves to a file or folder (`tooling/repo-standards/check_links.mjs`);
- **retired vocabulary** does not appear in live docs. The list is
  `tooling/repo-standards/retired-terms.json` (term, why it is retired, what
  to say instead, which paths are exempt: decisions and archives may quote
  history); a term is added there in the same commit as the decision that
  retires it;
- every `docs/research/**/*.md` outside `archive/` is linked from its
  folder's README (the index is the status register);
- **a content hash quoted in a live doc is current or dated** (owner
  2026-09-13, after the 16b ledger's round-2 shas went stale when the next
  chain run refreshed `freeze.json`): any 12+ hex hash under `docs/` must
  match a hash in the record files named in `retired-terms.json`
  (`freeze.json`, the hydrology graph, `water-meta.json`, `ladder.json`) or
  sit on a line that dates it (a date, "round N", "commit" or "was").
  Live prose names the record file; it does not copy the number;
- **counts agree with the data**: `docs/FACTS.md` is generated from the
  committed data (`npm run facts`) and must be current; a live doc that
  states a different number next to a tracked noun (clips, standards, ferry
  services, dungeon-kind records, rivers, reaches, built bodies, published
  kits; the list is `retired-terms.json` `facts`) fails unless the line is
  dated as history. Live prose links FACTS.md instead of copying a number.

Checked mechanically by `npm test` (repo-standards `checkDocsCurrent`); the
failure demonstrations are the 2026-09-13 run over the tree before the audit
fixes landed (the check found leftovers the audits had listed) and a
throwaway doc quoting `deadbeef…`, which the hash rule rejected.

## 16. What ships is compressed, and the payload is a budget with a gate

Owner 2026-09-18, after the composed Pages site was found at ~1,041 MB
against GitHub's 1 GB limit and the studio was measured downloading ~231 MB
before the world appeared, 70–91 % of it uncompressed PNG inside kits. The
owner's question was how to stop it happening again; the answer is that a
written rule is the weakest of the three layers below, so all three exist.

- **Compressed by default.** An asset that reaches a browser is stored in the
  format its kind warrants — kits are UASTC/KTX2 textures plus meshopt
  geometry, published only through `pipeline/kit_compress.py`, never copied
  raw. The raw build stays under `output/kits/` for the tools that measure
  it. A kit that opts out carries the reason in its config and its manifest
  (`waterfall-fx-v1`: 16 px stub textures loaded from renderer-less paths).
  GPU-compressed textures stay compressed in VRAM, so this is a budget for
  the mid-range GPUs we target, not only for the download.
- **The payload is measured, not assumed.** Work that adds to what a player
  downloads states the before and after in its ledger. The measuring tool is
  `apps/world-studio/scripts/probe-deployed-requests.mjs`, which serves the
  production build under the Pages base path and reports every request with
  its bytes and status; a startup payload nobody measured is a number that
  will be discovered by the owner instead.
- **The budgets, as gates.** Startup kit bytes ≤ 52 MB
  (`test_kit_compress.py`, 45.6 MB today); composed site fails over 900 MB
  and warns over 750 MB (`tooling/pages-site/compose.mjs`, 380 MB today with
  the current ladder, 561 MB with every kit); every published kit carries a
  `compression` record whose size matches the shipped file. Audio
  (`packages/audio/files/`, decision 0094) warns over 30 MB and fails over
  50 MB (`packages/audio/budget.json`, counted once on the site by
  compose.mjs; 5.0 MB today). Raising a budget
  is a decision with a measurement, never an edit in passing.
- **Ship only what the shipped ladder can display.** The Pages artefact
  derives its contents from `province/ladder.json` and reachability, so data
  for a hidden layer is not published and returns by itself when the layer
  is shown (decision 0073 §7).

Checked mechanically: `test_kit_compress.py` (in `npm run test:pipeline`),
shown failing on all 21 uncompressed kits and on a startup total of 118.9 MB;
the compose gates, shown failing by planting a reference to a kit that does
not exist and to a chain-only raster. Compose keeps kit files by resolved
reference, never by folder name, and fails on any dangling reference in what
it ships (`kit-reach.mjs`); preflight runs the same reach over the sources as
gate `site-refs` (<1 s, no build) and every published place bundle through
the runtime's file-decidable load refusals as gate `bundle-load` (decision
0052 addendum 2026-09-28; both shown failing on a copy without
`works-v1-fx/candleflame01.png`).

Before merging to main, commit, then run `npm run preflight -- --runner` once:
it runs the deploy gates from a clean clone of HEAD in a temp directory, with
the vault emptied and only what the workflow adds (the province raster cache,
`npm ci`'s node_modules), so an untracked or gitignored file (a raw kit build
under `tooling/asset-pipeline/output`, an unpublished kit, an uncommitted
edit) cannot make a gate pass here that fails on main (2026-09-22: two such
tests reached main; 2026-09-27, run 36327676173: six more did, because runner
mode then ran in the working tree). A test that needs a local build output that
never ships skips with that reason; one that judges what ships reads the
published copy under `public/`.

## 17. Saved state is versioned, serialisable data from the moment a system is written

Owner 2026-09-18 (decision 0074 §4). Every runtime system in `packages/`
that holds state a player expects to survive a reload — inventory,
equipment, quest flags, discovered markers, faction standing, world-state
overlays, the character sheet, positions of things that move — exposes that
state through one contract: a plain-data snapshot with its own
`schemaVersion` (standard 7), produced and consumed by two pure functions
(`snapshot()` / `restore(data)`), never by reaching into live objects.
State that is derived (caches, GPU resources, animation mixers) is rebuilt
from the snapshot, never saved. Phase 10c ships the `SaveGame` contract
that composes these; until then a system that cannot produce its snapshot
is a defect against this standard, not a later job.

**Why now:** the save format is the one contract that touches every
system's state shape; retrofitting it means opening every system twice.

Checked: a system's `snapshot()`/`restore()` round-trip test (in the
pattern of the package's other unit tests); the composed contract's gate
arrives with 10c.

## 18. One home table, references by id, and an integrity gate

Owner 2026-09-27 (decision 0104). Every entity kind has exactly one home
record family, keyed by its stable id: a place in the catalogue, a placed
interactable in its place's layout (`socket.<place-slug>.<slug>`), a door
in the blueprint, a promise in the place's ledger
(`world/sources/placement/promises/`), a travel service in
`travel-services.json`, a person in the NPC registry. Any other record
that needs the thing names its id and never copies its facts; a derived
file (a blueprint export, a compiled bundle) is a build output and carries
the hash of what it came from. Each family has one JSON Schema in
`packages/world-schema` (`families.json` is the registry). Checked:
`packages/world-schema/test_world_schema.py` in `npm test` validates every
family and asserts that every reference resolves to the family it names, that
no id has two homes, and that every promise is filled or excused (the open
count is pinned per place and only falls); every family in
`data-registry.json` names its schema or a queued owner.

JSON records are edited through a parser or the record tool, never by
character-offset splicing: a splice deleted 966 lines of a catalogue file in
the walk-8 record-coherence round (preserve the file's indent and newline).

## Performance checklists (decision 0108)

Standing rules for anything that draws, lights or streams; the architecture
and numbers are in [0108](../decisions/0108-performance-architecture-fixture-light-field-ready-materials-view-gated-streaming-fading-tiers.md),
the frame budget in [0084](../decisions/0084-the-frame-is-a-triangle-budget.md).
A frame is won by doing less invisible work, never by lowering a visible
default (MSAA stays on). Measure with a node harness over the real code;
the owner's device gives the fps verdict; never probe the full studio
headless.

**Before adding a light.**
- A fixture light (lamp, candle, brazier, window, anything placed) is a
  slot in the scene's `FixtureLightField` (`render/fixtureLights`,
  `fixtureLightFieldOf(scene)`), never a new `THREE.PointLight`. The field
  holds 100 (`LIGHTS_CAP`); each object sees its nearest 8, terrain 16.
- The count of real three lights is constant for the session (today: the
  sun/moon rig and the carried torch, parked at intensity 0 when unused).
  Never add, remove or hide a real light at runtime: every lit program
  relinks.
- Never toggle light or `castShadow` state per frame; refresh shadows with
  `shadow.needsUpdate` (or `shadowMap.needsUpdate`): three re-derives every
  lit program whenever the light set's shape changes.

**Before adding a material.**
- Per-frame shared uniforms live in the one aerial uniform block
  (`EsAerial`, `sky/aerial.ts`), never as per-material uniforms: three
  re-compares every material uniform on each material switch.
- Share it: one material per kit glTF material (or per batch key), never a
  clone per part or per instance.
- Any term of the water shading normal or crest that can change faster
  than the vertex spacing (shore direction, shore-swell slope, short or
  high-curvature bands) is evaluated per pixel at the REST xz
  (`vEsRestXZ`), never carried in the vertex normal and never at the
  displaced position; only heights stay per vertex (0047). A value that
  changes direction or crosses a threshold between vertices (a direction,
  a phase, a band pick) never enters the fragment as a varying; the vertex
  stage passes only rest xz and heights (diag15 V4: the surf foam phase).
  Bands are
  picked by curvature (amp*k^2) against the mesh grid, never by amplitude
  (`crestBands`; diag12 Q2, diag14 V1/V2).
- A patched material has a stable `customProgramCacheKey` that reads only
  its held state; re-applying the same state sets no `needsUpdate`.
- Patch it before its first draw: streamed builds go through the lit
  preparer (`litPreparerOf`) and `renderer.compileAsync(obj, camera,
  scene)` before they join the scene; set layers at creation, not in an
  effect.
- A material whose transparent flag, defines or program hook key changes
  at runtime, or which first draws late (water bands, weather fx,
  night-only fx), is compiled in every variant at mount through the same
  warm path (`DrawTargetLinker.link`: the real object, each material it
  swaps to, the target its draw binds), with a test that the warm's
  program key equals the draw's (`water/render/waterLinkWarms.test.ts`).
- Variation (gain, tint, fade, flame strength) is a uniform, never a
  define or a value in the cache key.

**Before adding a drawable or streamed layer.**
- Instance it: one `InstancedMesh` per geometry × material with a compact
  visible prefix, never one draw per object; state the expected draw count.
- Give it bounds per spatial chunk (the settlement layer's 48 m squares,
  ground cover's wedges) so frustum culling can reject it; a sphere around
  the camera never leaves the view. `frustumCulled = false` only where the
  layer's own gate replaces it (distance AND the view frustum, widened, with
  a hysteresis latch: reuse `cellGating.viewPlanesFor` / `boxInPlanes`);
  shadow casters are kept by a sweep along the light.
- A merged batch's key never depends on the camera; every level is built
  before ready and walking only flips visibility between prebuilt batches
  (F40: the settlement layer merged on the main thread on every 40 m move).
- Build each unit once, on the input it settles on (the finest terrain LOD
  it needs, or a short settle window), and count rebuilds in a harness that
  replays a startup stream.
- Build near and in view first, inside a per-frame budget that stops before
  a step likely to overrun (large while loading, small after); index an
  expensive per-candidate test spatially once. Show changes in a few whole
  steps, never one refill per data arrival.
- A streamed instance layer gives each tile a stable slot range in its
  mesh, so a refill copies and uploads only what entered, left or changed;
  its commit uploads those ranges (`addUpdateRange`) split under a
  per-frame byte budget; and ALL its main-thread work (generation, fill,
  commit) shares one per-frame budget, checked inside each unit of work (a
  resumable generator), never only between units (`groundcoverSchedule.ts`
  `SlotAllocator`, `takeRanges`, `generationShareMs`, `runSlices`; diag16 W,
  diag18 G1-G3).
- Nothing on the per-frame path allocates: vectors, arrays, stats objects
  and closures are hoisted and reused.
- A per-step sampler in a march returns no boxed value (no `number | null`
  per step): the march lives inside the sampler and returns the verdict
  (`TerrainMarcher`, `FrameGroundSampler.occluded`; diag11 O1), and its
  call site sees one class (an empty state, never a fallback closure).
- Tier edges fade through the `lodFade` partition with the temporal
  history (one copy per pixel, every frame; coverage never dips), the
  incoming tier resident before the outgoing one steps out; the coverage
  test sits beside it.
- A budget line in 0084 terms: submitted vs in-view copies and triangles
  (all passes, shadow included) from a node harness over real data, against
  the 4 M-triangle frame, before the owner walks.
- No two surfaces share a plane (z-fighting): `wb.py coplanar` / `check`'s
  `coplanar` rule / `audit-interior` flag any pair within 2 mm / 2 deg over
  > 0.01 m2 unless one is a decal its runtime draws with polygonOffset;
  ~3 s a cell or place, 0.4 GiB (R90, worldgen/coplanar.py).

**Before reading a performance number.**
- A capture without a running clock is not a performance measurement: check
  the URL carries `rate=0.5` and the shot shows the intended time of day
  before reading any fps or 1 % low.
- A 1 % low judged from one run is checked against a repeat of the same
  spot before a cause is ruled noise.

## Memory discipline (tooling, 2026-09-30)

Every heavy tool runs on one shared 30 GiB machine beside other lanes; a
tool that holds tens of GiB kills the owner's session (the 2026-09-30 OOM
kills). The rules:

- **A tool that passes 4 GiB on one item is a defect**, fixed at source.
- **An op whose size is A × B is chunked**: rays × triangles, points ×
  candidate faces, cells × pieces, pixels × lights. trimesh ray casts and
  closest-point calls go through `worldgen/mesh_query.py` (`cast_rays`,
  `on_surface`; the workbench imports them from `workbench/mesh_query.py`),
  never `mesh.ray.intersects_*` or `ProximityQuery.on_surface` over a
  whole input. One unchunked ray call held 21 GiB; one closest-point call
  held ~1.9 GiB per contact pair, times the fork pool (place_gates
  Greenspring 7.2 GiB → 1.3 GiB).
- **Load once, share**: a mesh, raster or kit read per item that could be
  read once and passed (or inherited by a fork pool) is a defect.
- **Free what is done**: a per-item result is reduced to what the caller
  needs and dropped, never held for the whole run.
- **float32 where float32 does**: rasters and mesh arrays that need no
  float64 precision are stored as float32.
- **Read the peak from the job-guard log**: run heavy jobs under
  `tooling/repo-standards/job_guard.sh <lane> -- …` and read `ownPeakMiB`
  (the job's process tree, PSS: a fork pool's shared pages count once) and
  `scopePeakMiB` from `tooling/.reports/job-guard/<lane>-*.log`.
- **Every heavy tool has a peak target beside its wall target** in
  `tooling/repo-standards/tool_targets.json` (tools under `worldgen.`,
  `pipeline.` and `placement-workbench.` without a row get the 4 GiB
  default). memwatch prints `OVER TARGET` on a run past it, and
  `test_tool_timings.py` fails when a tool's latest run in the local log
  is over its target, so a memory regression fails the scoped test the
  way a slow run does. A target moves only with the measured run that
  justifies it.

The batch code review asks the same questions (`review_gate.py` prompt).

## Running the checks

**How the checks are run** (decision 0106): one scoped `npm run preflight
-- --paths <batch>` per commit batch, by the planner's `preflight` agent
(never for a docs-, report- or rulings-only batch; a scoped run over 60 s
fails); the full `--runner` run once before a merge to main; a red on HEAD
blocks until fixed at source. Every Agent or Workflow brief that launches a
deliver lane carries the line `Budget: <N> min (hard)`, and heavy jobs run
under `job_guard.sh <lane> --budget <N>`. Every python, Blender or node job that can pass 2 GiB runs under `job_guard.sh` (its own memory-capped scope, `--mem`, default 24 GiB): an unguarded one shares the editor session's cgroup, and its OOM takes the session down (2026-09-30, twice); the watchdog kills an unguarded one past 20 GiB. A new gate costs under 5 s and
answers a failure class seen twice. Hooks: [hooks.md](hooks.md).

```
npm test                     # from the repo root — includes repo-standards
npm test -w @elder-souls/repo-standards     # just these checks
npm run test:placement       # the worldgen/placement suites
```

Test selection: an exporter change selects the exporter and interior tests
only, not the whole placement group (143 s against the 60 s bar).

Each check names the standard it enforces and prints the offending file and
line. Every CI job that runs a Python gate installs
`tooling/world-generation/requirements-test.txt` first (deploy-pages.yml), so
a gate may import anything listed there and nothing else; a new dependency
goes into that file in the same change. If a check is wrong, fix the check — do not add an exemption without
saying why in the allowlist file.

`npm test` and `npm run typecheck` fan the per-workspace scripts out in
parallel (`tooling/repo-standards/run-workspaces.mjs`, one lane per core;
`--jobs N` or `WORKSPACE_JOBS=N` to throttle). Output is buffered per
workspace and printed when that workspace finishes, and every failing
workspace is listed at the end rather than only the first.

Typechecking is incremental: each workspace's tsconfig sets `incremental`
with a `tsBuildInfoFile` under its own `node_modules/.cache/`, so a warm
rerun re-uses the previous program. CI is always cold — `npm ci` wipes
`node_modules`, and with it the cache — so the pipeline still gets a clean
full check.

Keep the typecheck scripts on `tsc --noEmit`, **not** `tsc -b`. Build mode's
up-to-date check only looks at a project's own root files, so with a build-info
file present it skips the whole project when the change was in a sibling
workspace's `src/` — a real cross-package type error passes. Measured, not
theorised: a deliberate error in `packages/world-time/src` was reported by
`tsc --noEmit` in world-studio and silently skipped by `tsc -b`.
