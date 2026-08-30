# Game build-out register (the systems seam)

The world-build master plan deliberately builds **only as much of the game's
systems as the world build needs** — contracts, thin slices and calibration
data, never finished systems (the established pattern: capability profiles
75 §52, Phase 9's "thin contract with defaults", semantic authoring 76 §128,
the quest plan's typed condition vocabulary). Everything past that line
belongs to the **next goal** — building the world and its proven systems out
into the full game — whose master plan will be drafted when the world build
closes and the owner resets CLAUDE.md § GOAL. Policy: decision
[0038](decisions/0038-world-build-vs-game-buildout-seam.md). **The full
evidence base is the
[build-out systems audit](research/game-buildout-systems-audit.md)
(2026-08-30, five parallel audits)** — read it before drafting the build-out
plan; this file is the maintained summary.

This file is the systems twin of [polish-backlog.md](polish-backlog.md)
(cosmetic/feel leftovers for Phase P — not systems). One row per deferred
system: what the world build already owns, what is deferred, and the
**hook** — the contract or data the owning world-build phase must leave
behind so the deferred work stays cheap. **A world-build phase that touches a
row and ships without its hook is not done.** Owner and agents add rows
freely; shrink or delete rows as phases absorb them.

## Architecture debt (audit §1 — not a "system", but the build-out's first job)

`apps/game` is a 60-line stub; ~7,300 LOC of game-runtime renderer
(sky/light, water pipeline, weather, terrain streaming, vegetation, character
driver) live app-private in `apps/world-studio/src`, coupled by module-level
singletons, plus ~130 MB of world data in its `public/`. Simulation packages
(~17k LOC) are already shared. Recommendation: "apps/game becomes real"
(renderer extraction as one `world-render` package, game shell, deploy slice)
is the build-out's **first milestone**. **Standing hook now:** new
world-render code lands package-shaped where cheap; new debug hooks go behind
a dev-only seam, not more `__STUDIO_*` globals; Phase 10b's §53 scene-adapter
merge is designed as *the* adapter the game app will also use.

## Recommended pull-ins — world-build scope, owner ratifies at the named kickoff

- **Full movesets for the kept weapon classes** (Blunt, Axe, Spear/pike/
  halberd/staff, Short Blade, unarmed — chassis taxonomy per 0031). Clip
  *sourcing* is already a registered Phase 10 job with verified candidates
  (90 §74.3). Recommendation: wire clips at **10b** (combat-space probes
  under-measure with only 1H+bow), class numbers at **10c**, all before
  **13**. Ratify at 10b kickoff.
- **Minimal NPC detection model** (view cones + seen/unseen, one service).
  Sneak XP (76 §120.1), sneak-opener bands (§121.5), Elusiveness-vs-Spot,
  watcher-cone and disguise quest conversions, and crime detection all
  consume it; **no phase owns it**. → 10b's enemies or 10c, before 13.
- **Shield parry ruling** — in [polish-backlog.md](polish-backlog.md) tagged
  `10b`.
- **At Phase 11 kickoff:** per-body `WaterBody` records (0025 deferred them
  *to* Phase 11; its deliverable list omits them) · timetable *data* on the
  travel-service graph (departures/tides as queryable data — manhunt quests
  are unsolvable without it) · a prior→roster demographic generation rule
  (92 §84) · the **vastei tutorial scene** flagged into whichever packet owns
  the game's opening (owner-required, 76 §120.3; currently in no quest doc).
- **At the Phase 10 gate:** schedule or consciously re-defer the
  beyond-border land apron (55 §98b says "alongside Phase 10").
- **At Phase 12:** underwater POI access-metadata schema (air pockets,
  return routes, gating tiers — 60 §44) alongside "underwater entrances";
  artificial-light design (torches/lanterns/magelight) with interiors.
- **By 10c:** magic `StatEffect.field` enum + cast-interruption-vs-poise
  rule (Phase 13's enemy casters need a castable slice; audit §2E) ·
  weapon poisons/oils + the H2H knockout finisher (decided at S round 4,
  missed by both 10c deliverable lists) · resolve the 10×-vs-8× training
  price contradiction (audit §6).

## Deferred systems

| System | World build owns (where) | Deferred to build-out | Hook the world build must leave |
|---|---|---|---|
| **Stealth, full stack** | detection math + sneak bands designed (76 §120/§121.5); ambient-AI marks/patrols data (72, Phase 13); minimal cone model per pull-in above | light/sound stimuli, alert→search→give-up, distraction verbs, crime response, NPC hearing (57 §105) | one detection *service* consulted by all NPC logic, never per-enemy checks; NPC schema keeps Spot-side stats (76 §129) |
| **Quest engine + journal** | quest master plan, Milestone-1 provisions, sockets (75 §56), stable IDs, co-design briefs per packet | runtime: flag store, stage machine, journal UI, ending-availability computation, fail-forward successors, the 24-quest main line + faction lines | **the typed condition/action vocabulary must be AUTHORED — it is mandated but enumerated nowhere** (quests 80 §58 now says so; Q1 gate); every placed thing keeps its stable ID |
| **Dialogue/interaction UI** | Phase 11 needs a minimal talk verb (travel services, merchants); persuasion math (76 §125) | topic web, KnowledgeState (topics/evidence/witnessed/rumours/lies), glossary + newcomer-topic coverage (Q0 gate), disposition verbs | Phase 11 ships talk→service-menu as a small *contract*, not a ferry hack |
| **Scene & staging runtime** | SCENE sockets + actor marks (11/12); D-tier conversion rules are authored constraints | leash/teleport followers (invulnerable in transit), shared-timer intercepts, ≤6-hostile enforcement, pull-through-the-door verb, dream/vision harness, aftermath pockets, boss stand-down routes | staging composes stock idle/patrol/combat AI only (72 §113 ceiling); scenes survive a missed mark by design |
| **Local world-state overlay runtime** | 2–3 authored variants per quest location ship in bundles (Phase 14; quests 20 §14 bounds) | LocalStateVariant application: enable/disable refs, schedule/service overrides, ambience, `washed-out` material flag | variants are pure bundle data; no quest rewrites terrain/hydrology |
| **Reward tracks & stronghold** | stronghold site reserved (11), interiors (12); reward *items* via loot compiler | allegiance ladders + opt-in locks, informant map-marker grants, off-screen service menu, income timers, restricted-door/toll flag class, stronghold 3-layer + 4-overlay compositor | rewards stay data (items/flags/markers/prices/nodes), never behaviour (30 §24b.6) |
| **Evidence & artifact custody** | EVIDENCE sockets placed (11/12) | evidence items/flags, `essential` tier-protection at runtime (incl. DQ02's topic deletion), the Eye custody invariant ("never permanently lost") | evidence sockets carry stable IDs + copy/alter/return affordances in data |
| **Map, markers & discovery** | every unmarked POI gets its diegetic pointer (13; briefs at 11) | player map with grantable persistent markers (no quest markers exist — the informant grant is the game's strongest utility reward), rumour pools, discovery feed | pointer + rumour data authored per packet, keyed to local state |
| **Save/load & persistence** | save-on-rest decided (0031, 76 §126); 10c ships one `SaveGame` contract for player state | versioned format, IndexedDB + export/import, slot UI, migration; the main quest's doom-warning restore prompt depends on it | saves reference versioned bundles + variant flags, never copy world data |
| **Magic, player-facing breadth** | math + data at 10c; effect enum + interruption rule by 10c (pull-in); castable enemy slice by 13 | spell-effect catalogue, acquisition, spellmaking/enchanting service UIs, soul gems/trap/recharge (+ the Argonian-soul exception), summons, casting input | casting clips + FX tagged by Phase 10's registry sweep; all effects through the one stack |
| **Combat verb completion** | 10b wires the sourced movesets (pull-in); poise/equip-load at 10c | charged/running/jumping/plunging attacks, kick/shield bash, two-handing (input reserved, unbound), weapon poisons, H2H finisher | attack taxonomy stays data on the class table (76 §121.3) |
| **Enemy & boss AI depth** | sandbox AI ports at 10b; territories/leashes on baked nav (72/13); archetypes on the D-ladder (76 §128) | DS-style boss behaviour (Xal-Krona), group tactics, morale/flee, ranged AI, aquatic combat actions (75 §57), summon AI | AI reads baked nav + NPC schema only; boss movesets are sourced-clip jobs |
| **Factions runtime, crime & bounty** | FactionStanding schema (quests 40 §27–28), disposition (76 §125), territories (Phase 4), cast (35/36) | rank advancement, expulsion/reinstatement, **crime-as-Owing ledger** (nushmeekos assessment, regional parameters, jails, audit/buy-out/burn/pay), contract boards | gates stay in the typed vocabulary; crime detection reuses the single detection service |
| **Economy runtime** | barter/purse/trainer math (76 §124); merchant sockets (75 §56); loot provenance (13) | restock/purse cycles, shop + service UIs (repair/enchant/spellmake/recharge/cure/train), finite fences, income timers, **guide services + hazard-prep goods** (30 §26) — incl. stocking water-breathing consumables (00-core criterion 25, an accessibility guarantee) | merchant stock = loot IDs through the semantic compiler; no parallel item system |
| **Character creation & onboarding** | races/birthsign slot/specialization data at 10c; birthsign *contents* deferred (76 §119.2) | chargen UI flow, intro sequence, tutorialization, the 13 sign packages | 10c keeps race/sign/class fully data-driven |
| **Menus, settings, accessibility** | difficulty knob at 10c (76 §121.4) | main menu, settings/rebinding UI, accessibility, (localization: explicitly out unless the owner says otherwise) | input stays behind `PlayerMovementController`; bindings data-driven |
| **Narrative tooling & QA** | studio shell + probe patterns exist; PROGRESS/validator culture | narrative debugger (quests 80 §64, 12 features), validator suite + LLM-critic (§63/63b), headless ending simulation | quest runtime headlessly drivable from day one (endings must be reachable in automated simulation) |
| **Music / score** | nothing — out of world-build scope (57) | the whole score (sourcing — no-new-art applies — explore/combat layers, region themes) | 12b's `AudioManager` leaves a music bus + ducking hooks |

**Awaiting an explicit keep / cut / defer ruling** (audit §4 — batched, no
urgency; decide at the phase that would own each or at build-out planning):
drifting/floating settlements · fire-in-a-wetland + `fire`/`mudResponse` ·
river-pirate boat encounters · the deferred boat tier (cargo/ownership/AI
boats; `BoatStorageSocket` orphaned) · boat nav constraints · mounts ·
swamp-jelly husbandry · Hist systemic layer (dreams/memory/sap physiology) ·
per-culture doctrine/taboo/burial expression · festivals + ritual time
gates · tide-gated access gameplay (data built, no consumer) · creature
boat/tree use + moving root barriers · wild wamasu (blocks quest FG03) ·
era-aware layering (moot at 4E 201) · demographics → language/clothing/
food/religion · delete the orphaned `rootwormTransit` mode.

**Not rows:** catalogue *breadth* (weapons, armour, uniques, spells, books)
is **content**, not a system — it lands through Phase 13/15 packets and quest
briefs via the semantic compiler. The item *data architecture* that must carry
it at Morrowind scale is 10b/10c work under the CLAUDE.md scaling rule.

When the world build closes: the owner resets CLAUDE.md § GOAL, and the first
build-out task is turning this register + the audit into a modular master plan
(mirror the docs/world/ structure — a core, a router, modules; sketch at
audit §7).
