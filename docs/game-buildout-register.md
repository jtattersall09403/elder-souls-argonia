# Game build-out register (the systems seam)

The world-build master plan deliberately builds **only as much of the game's
systems as the world build needs** — contracts, thin slices and calibration
data, never finished systems (the established pattern: capability profiles
75 §52, Phase 9's "thin contract with defaults", semantic authoring 76 §128,
the quest plan's typed condition vocabulary). Everything past that line
belongs to the **next goal** — building the world and its proven systems out
into the full game — whose master plan will be drafted when the world build
closes and the owner resets CLAUDE.md § GOAL. Policy: decision
[0038](decisions/0038-world-build-vs-game-buildout-seam.md). Evidence base:
the [build-out systems audit](research/game-buildout-systems-audit.md)
(2026-08-30) **plus the
[Morrowind/Skyrim cross-check](research/source-game-systems-crosscheck.md)**
(triage + owner rulings: decision
[0039](decisions/0039-source-game-crosscheck-triage.md) — **all steers RULED
2026-08-30**; read its Rulings section before touching any cross-check item).

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
is the build-out's **first milestone**. **Standing hook — now a binding
CLAUDE.md golden rule (owner ruling 2026-08-30, 0038 addendum 2):** anything
the final game will need is written in `packages/` from the start, rendering
included; debug hooks behind a dev-only seam, not more `__STUDIO_*` globals;
Phase 10b's §53 scene-adapter merge is designed as *the* adapter the game app
will also use.

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
  Ready-made formulas: cross-check §4 (Skyrim's full model + Morrowind's
  direction multiplier).
- **Shield parry ruling** — in [polish-backlog.md](polish-backlog.md) tagged
  `10b`.
- **At Phase 11 kickoff:** **`owner`/`ownerFaction` + value tier on every
  placed interactable** (cross-check §1 — retrofit is the expensive
  version) · `STATION` socket type (crafting stations; assets in vault) ·
  per-body `WaterBody` records (0025 deferred them *to* Phase 11) ·
  timetable *data* on the travel-service graph + **urban water-taxi edges**
  · a prior→roster demographic generation rule (92 §84) · the **vastei
  tutorial scene** flagged into the packet owning the opening (template:
  Morrowind's diegetic chargen, cross-check §1).
- **At the Phase 10 gate:** schedule or consciously re-defer the
  beyond-border land apron (55 §98b says "alongside Phase 10").
- **At Phase 12:** dungeon **anchor sockets** (Boss/Boss-Chest/Captive) in
  the socket vocabulary · underwater POI access-metadata schema (60 §44) ·
  artificial-light design (torch mechanics gift-wrapped in cross-check §4) ·
  the unpickable-lock class + spell-as-alternate-key pattern. **0039 S1 is
  RULED: levitation, Mark/Recall, shrine-network Intervention, water
  walking, telekinesis, Open and Detect ALL EXIST** — dungeon/underwater
  access design must account for them (balance levers are Morrowind's own:
  spell cost, duration, slow flight speed, magicka economy, Dispel).
- **By 10c:** magic `StatEffect.field` enum + cast-interruption-vs-poise
  rule (13's enemy casters need a castable slice) · weapon poisons/oils +
  the H2H finisher (decided at S round 4, missed by both 10c lists; H2H
  shape: cross-check §4) · **Fight/Flee/Alarm ints + creature statblock
  class + overlay/state flags on the actor schema** (cross-check §1) ·
  resolve the 10×-vs-8× training price contradiction (audit §6). (The
  survival item-schema field was dropped — 0039 S2 cut the survival layer.)

## Deferred systems

| System | World build owns (where) | Deferred to build-out | Hook the world build must leave |
|---|---|---|---|
| **Stealth, full stack** | detection math + sneak bands designed (76 §120/§121.5); ambient-AI marks/patrols data (72, Phase 13); minimal cone model per pull-in above | light/sound stimuli, alert→search→give-up, distraction verbs, crime response, NPC hearing (57 §105) | one detection *service* consulted by all NPC logic, never per-enemy checks; NPC schema keeps Spot-side stats (76 §129) |
| **Quest engine + journal** | quest master plan, Milestone-1 provisions, sockets (75 §56), stable IDs, co-design briefs per packet | runtime: flag store, stage machine, journal UI, ending-availability computation, fail-forward successors (+ the reputation-bypass pattern, cross-check §4), the 24-quest main line + faction lines | **the typed condition/action vocabulary must be AUTHORED — mandated but enumerated nowhere** (quests 80 §58; Q1 gate); add `deedCountAtLeast` + player-state overlay predicates (0039); every placed thing keeps its stable ID |
| **Dialogue/interaction UI** | Phase 11 needs a minimal talk verb (travel services, merchants); persuasion math (76 §125) | topic web, KnowledgeState, glossary + newcomer-topic coverage (Q0 gate), disposition verbs + the refusal ladder (cross-check §4) | Phase 11 ships talk→service-menu as a small *contract*, not a ferry hack |
| **Item ownership & theft** (adopted, 0039 — **Morrowind-visibility model**) | Phase 11/12/13 place an *optional* `owner`/`ownerFaction` + value tier — unowned is the wilderness norm; taking unowned is never theft | witnessed-theft detection (a bounty exists ONLY if the act is seen), read-in-place book rule, trespass-on-unlock | ownership ships with placement, never retrofitted; **no stolen flag on possessed items, no fencing/laundering mechanics — once you own it, nobody can tell** (owner ruling) |
| **Scene & staging runtime** | SCENE sockets + actor marks (11/12); D-tier conversion rules are authored constraints | leash/teleport followers (invulnerable in transit), shared-timer intercepts, ≤6-hostile enforcement, pull-through-the-door verb, dream/vision harness, aftermath pockets, boss stand-down routes, rest-interrupt reprisal events (0039 S7: kept) | staging composes stock idle/patrol/combat AI only (72 §113 ceiling); scenes survive a missed mark by design |
| **Local world-state overlay runtime** | 2–3 authored variants per quest location ship in bundles (Phase 14; quests 20 §14 bounds) | LocalStateVariant application: enable/disable refs, schedule/service overrides, ambience, `washed-out` material flag | variants are pure bundle data; no quest rewrites terrain/hydrology |
| **Reward tracks & stronghold** | stronghold site reserved (11), interiors (12); reward *items* via loot compiler | allegiance ladders + opt-in locks, informant map-marker grants (shadowmark-shaped, cross-check §4), off-screen service menu, income timers, steward pay-for-service pattern, restricted-door/toll flag class, artifact-donation sink, stronghold 3-layer + 4-overlay compositor | rewards stay data (items/flags/markers/prices/nodes), never behaviour (30 §24b.6) |
| **Evidence & artifact custody** | EVIDENCE sockets placed (11/12) | evidence items/flags, seal/re-seal tampering verb (cross-check §4), `essential` tier-protection at runtime, the Eye custody invariant | evidence sockets carry stable IDs + copy/alter/return affordances in data |
| **Map, markers & discovery** | every unmarked POI gets its diegetic pointer (13; briefs at 11) | player map with grantable persistent markers, rumour pools, discovery feed, Detect-spell integration (per 0039 S1) | pointer + rumour data authored per packet, keyed to local state |
| **Courier & reprisal channel** (adopted, 0039) | letter/rumour pools authored per packet (11/13) | the carrier that finds the player, inheritance/reprisal letters, hired-thug/Owing-enforcer reprisals escalating with debt and notoriety (0039 S7: kept) | letters are typed content units keyed to world state |
| **Save/load & persistence** | save-on-rest decided (0031, 76 §126); 10c ships one `SaveGame` contract | versioned format, IndexedDB + export/import, slot UI, migration; doom-warning restore prompt; the lifetime ledgers (crime/Owing per region, dungeon-cleared counters) | saves reference versioned bundles + variant flags, never copy world data |
| **Magic, player-facing breadth** | math + data at 10c; effect enum + interruption rule by 10c (pull-in); castable enemy slice by 13 | spell-effect catalogue **incl. ALL the Morrowind traversal families — levitation, water walking, Mark/Recall, telekinesis, Open, Detect, shrine-network Intervention (0039 rulings: kept; flavour race-neutral — no Hist-gated Recall)**, acquisition, spellmaking/enchanting service UIs, soul gems (NPC souls untrappable), summons, casting input | casting clips + FX tagged by Phase 10's registry sweep; all effects through the one stack; powers = once-per-day semantics (cross-check §4) |
| **Combat verb completion** | 10b wires the sourced movesets (pull-in); poise/equip-load at 10c | charged/running/jumping/plunging attacks, kick/shield bash, two-handing, weapon poisons, H2H fatigue-takedown finisher (0039: Morrowind shape confirmed) — **killmove layer, projectile interception and bleedout states all CUT by 0039 rulings** | attack taxonomy stays data on the class table (76 §121.3) |
| **Enemy & boss AI depth** | sandbox AI ports at 10b; territories/leashes on baked nav (72/13); archetypes on the D-ladder; Fight/Flee/Alarm ints on the schema (pull-in) | DS-style boss behaviour (Xal-Krona), group tactics, morale/flee driven by the Flee value, ranged AI, aquatic combat actions (75 §57), summon AI | AI reads baked nav + NPC schema only; boss movesets are sourced-clip jobs |
| **Factions runtime, crime & bounty** | FactionStanding schema (quests 40 §27–28), disposition (76 §125), territories (Phase 4), cast (35/36), **reaction matrix as data + attire `factionSignal` tags** (0039) | rank advancement (3-part gate shape, cross-check §4), expulsion/amends, **crime-as-Owing ledger, per city/region (0039: a Gideon bounty doesn't follow you to Lilmoth; guards stop you where an uncleared bounty exists)** + adopted counterplay (self-defence rule, provocation verbs, notoriety tiers, custody costs in progress-time, writ item class, 72-h amnesty/decay), contract boards, **per-settlement customs/etiquette + capped outsider standing + favours ladder (0039 S5: adopted)** | gates stay in the typed vocabulary; crime detection reuses the single detection service; worst-reaction-wins is one computed term |
| **Deed counters & silent unlocks** (adopted, 0039) | counters are authored per faction/packet (11/13) | runtime accumulation, passphrase/topic unlocks, Twin-Lamps-style hidden factions | `deedCountAtLeast` in the Q1 condition vocabulary |
| **Economy runtime** | barter/purse/trainer math (76 §124); merchant sockets (75 §56); loot provenance (13); **shrine-blessing services priced by faith standing, contraband flags, staged-disease counterplay goods** (0039) | restock/purse cycles (+ the merchant rules in cross-check §4), shop + service UIs, income timers, guide services, **bed rental (0039 S3: no camping in settlements — wait only; resting in town needs a bed, so inns are economically real)** — incl. stocking water-breathing consumables (00-core criterion 25) and disease/venom cures (the S2 survival layer is CUT; counterplay lives in the normal cure/resist economy) | merchant stock = loot IDs through the semantic compiler; no parallel item system |
| **Crafting stations & resource nodes** (adopted, 0039) | `STATION` sockets + station/harvest placement (11/12/13); physical materials (10) | station interaction verbs (forge/temper/brew/cook/tan), resource-node yield tables, the pelts→leather and reeds/clay chains, container respawn + safe-storage policy | stations/nodes are placed data with vault meshes + use-animations; repair tools are consumable items |
| **Character creation & onboarding** | races/birthsign slot/specialization data at 10c; birthsign *contents* deferred (76 §119.2) | chargen UI flow (diegetic class-quiz template, cross-check §1), intro sequence, tutorial-by-object-pickup, the 13 sign packages | 10c keeps race/sign/class fully data-driven |
| **Menus, settings, accessibility** | difficulty knob at 10c (76 §121.4 — a pure two-sided multiplier, cross-check §4) | main menu, settings/rebinding UI, accessibility, (localization: explicitly out unless the owner says otherwise) | input stays behind `PlayerMovementController`; bindings data-driven |
| **Narrative tooling & QA** | studio shell + probe patterns exist | narrative debugger (quests 80 §64), validator suite + LLM-critic (§63/63b), headless ending simulation | quest runtime headlessly drivable from day one |
| **Music / score** | nothing — out of world-build scope (57) | the whole score (requestable tavern performers CUT by 0039) | 12b's `AudioManager` leaves a music bus + ducking hooks |

**Awaiting an explicit keep / cut / defer ruling.** The 0039 steers are all
RULED (see its Rulings section). Still open from them: **Hist-site communion
powers** — a design slot, pursued only if a proposal is simple, fun,
reuses powers/effect-stack semantics and stays race-neutral-completable;
**pilgrimage circuits** — deferred to quest authoring with a nudge planted
in the Nisswo line (quests 40); **fishing** — adopted iff the animation is
a cheap sourcing job (check vault/mod scene first). Remaining: **the audit
§4 ambitions batch** (drifting settlements · fire-in-a-wetland +
`fire`/`mudResponse` · river-pirate boat encounters · deferred boat tier
(`BoatStorageSocket` orphaned) · boat nav constraints · mounts ·
swamp-jelly husbandry · per-culture doctrine/burial *expression* (the
customs/standing mechanic itself was adopted, 0039 S5) · festivals +
ritual gates (pilgrimages deferred as above) · tide-gated access gameplay ·
creature boat/tree use · wild wamasu (blocks quest FG03) · era-aware
layering (moot at 4E 201) · demographics → language/clothing/food/religion
· delete the orphaned `rootwormTransit` mode). Recorded cuts from the
cross-check + 0039 rulings (player vampirism/lycanthropy, shouts, player
construction, swappable birthstones, apex roamer, marriage/adoption,
survival attrition, bleedout, killmove layer, projectile interception,
tavern performers, stolen-flag/fencing) live in those two docs with
citations.

**Not rows:** catalogue *breadth* (weapons, armour, uniques, spells, books)
is **content**, not a system — it lands through Phase 13/15 packets and quest
briefs via the semantic compiler. The item *data architecture* that must carry
it at Morrowind scale is 10b/10c work under the CLAUDE.md scaling rule.

When the world build closes: the owner resets CLAUDE.md § GOAL, and the first
build-out task is turning this register + the audit + the cross-check into a
modular master plan (mirror the docs/world/ structure — a core, a router,
modules; sketch at audit §7).
