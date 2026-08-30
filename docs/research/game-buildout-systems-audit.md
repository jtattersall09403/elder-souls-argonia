# Game build-out systems audit (2026-08-30)

**What this is:** the comprehensive audit of everything the *final game* needs
that the world build will not deliver — commissioned by the owner the day the
seam policy landed (decision 0038). Five parallel audits fed it: (1) app/package
architecture, (2) the quest plan's runtime demands, (3) the accepted stats
design's demands, (4) the implemented combat/character stack, (5) a sweep of
the world-plan modules for assumed-but-unowned systems.

**How to use it:** [../game-buildout-register.md](../game-buildout-register.md)
is the live, lean summary (rows + hooks); this doc is the evidence and detail
behind it, and the seed of the build-out master plan. Statuses here are a
snapshot of 2026-08-30 — the register is maintained, this doc is not (except
to correct errors).

**Target restated (owner):** a TES game set in Black Marsh with the soul of
TES III Morrowind, Dark Souls 1 combat, Skyrim visuals, BotW climbing —
browser-played, GitHub Pages, no new art ever, no level scaling ever, text-led
(no full VO), no companions, no multiplayer.

---

## 1. Architecture: how the studio becomes the game

**Verdict: a medium-large port, front-loaded with package extraction, not new
code — and currently owned by no phase.**

- `apps/game` is a **60-line stub** (no renderer, no vite config, not
  deployed; CI ships combat-sandbox to the site root and world-studio to
  `/studio/`). Its own comment says real composition "begins at Phase 7";
  Phase 7 came and went.
- The **simulation layer is already shared and free**: ~16,900 LOC in
  `packages/` (combat, animation, inventory/equipment, actors, input, CPU
  water model, world-time, world-weather, contracts). `apps/game` can consume
  all of it today.
- The **renderer is not**: of world-studio's ~9,100 LOC, **~7,300 (≈80 %) is
  game-runtime code living app-private** — the entire sky/light stack
  (~3,030), water rendering + the frame pipeline (~1,820), terrain
  streaming + the only `EnvironmentQuery` implementation (~660), the
  character driver (~500), vegetation renderer (436), weather expression
  (~430), ground splat material (254), touch input (119). Plus ~130 MB of
  world data under `apps/world-studio/public/` the game needs identically.
- Only 6 of the ~24 packages module 80 §59 plans exist; every *rendering*
  package is missing.
- **Structural hazards** for the extraction: (i) sky/water/weather/terrain
  are a 5-way import cycle coupled by mutable module-level singletons
  (`sharedAerialUniforms`, `worldClock`, `wetnessUniforms`…) — they extract
  as **one `world-render` package** or need an injected-uniform seam first;
  (ii) the studio clock is paused-by-default and several systems are tuned
  under it (water clock cap, alternate-frame shadow updates) — re-validate
  under `GAME_TIME_SCALE = 30`, don't just re-import; (iii) the
  `__STUDIO_*_DEBUG__` globals are the contract for all probe suites —
  decide dev-only-export vs ship; (iv) the §53 scene-orchestration merge must
  reconcile the studio's `CharacterDriver` with the sandbox's 2,801-line
  `CombatScene.tsx` (7 of 9 §53 items still live there, including two
  acknowledged duplicate camera implementations).
- **Size split:** ~2,000 LOC mechanical moves (vegetation, chunk
  store/colliders, touch controls, the pure-function sky math);
  ~4,800 LOC risky (WorldSky, the water frame pipeline, chunkWorld's baked
  scale conventions, groundMaterial, CharacterDriver); genuinely new:
  game shell/App, menus, save, vite+deploy wiring.

**Recommendation (owner ratifies when the build-out plan is drafted):** make
"apps/game becomes real" the build-out's **first milestone** — extract
`world-render` (as one package first, split later), stand up the game shell on
the same packages, and only then build new systems *into* the game app. The
world build should not pay for this early (nothing in it needs apps/game), but
Phase 10b's §53 extraction should be done knowing the studio's CharacterDriver
and the sandbox scene merge into the *same* adapter the game will use.
Standing stop-the-bleed hook (register): new world-render code lands
package-shaped where cheap; debug hooks go behind a dev-only seam, not new
`__STUDIO_*` globals.

---

## 2. System map — status ledger by pillar

Key: **BUILT** (exists, mature) · **phase N** (world build owns) · **10c-math**
(formula/data ship at 10c, playable system does not) · **REGISTER** (deferred
with a register row) · **UNOWNED** (nobody) · **CUT** (recorded cut).

### A. World simulation & rendering
Terrain/hydrology/regions/climate BUILT · light/sky/time BUILT · water
render+query BUILT · weather BUILT · vegetation machinery phase 10 (in
progress) · navmesh/NavService phase 10b · streaming hardening phase 14 ·
**renderer package extraction UNOWNED (→ register, architecture row)** ·
volumetrics/god-rays/water-hero-tiers backlog (P) · beyond-border land apron
**UNOWNED** (55 §98b says "alongside Phase 10"; Phase 10's list omits it) ·
artificial/carried light (torches, forge, magic light) **UNOWNED** (55 §96
"later phases") · AI-state preservation across interior portals **UNOWNED**
(70 §48).

### B. Character & traversal
Locomotion/jump/roll/i-frames BUILT · swim/climb/boat modes phase 9 (clips:
swim=vanilla, climb=EVGAT/SkyParkour retarget risk, boat=seated+procedural) ·
burden/roll-tier/encumbrance math 10c · capability profiles regenerated 10c ·
underwater POI **access-metadata graph** (air pockets, currents, return
routes, four access tiers, 60 §44) **UNOWNED** — Phase 12 owns only
"underwater entrances" · climb-corridor validation loosely inside Phase 9's
"swim/climb/boat validation" but absent from 72 §115's probe list — make it
explicit at 9 kickoff · tide/flood-dependent **access gameplay** (channels,
crossings, submerged doors on the tide clock) **UNOWNED** — data BUILT at 8b,
nothing consumes it · mounts/horses **UNOWNED** (see §4) · physics mass-unit
cleanup backlog (Phase 9 boats depend).

### C. Combat
1v1 melee core BUILT and genuinely DS1-shaped (measured contact windows,
parry→riposte paired criticals, guard stability bands, backstab, lock-on,
deep bow ballistics) · poise/stagger + equip-load tiers designed-to-DS1-spec,
zero code, 10c (constants "provisional until sandbox calibration") · moveset
breadth: 1 of 3 families built; sourcing phase 10 (registered), **wiring =
10b pull-in awaiting ratification**; per-class numbers 10c · missing DS1
verbs beyond that: charged/running/jumping/plunging attacks, kick/shield
bash, two-handing (input reserved, unbound) → REGISTER (combat verb
completion) · shield parry ruling → polish-backlog `10b` · status-effect
build-up (bleed/poison meters) 10c effect stack + 13 content · enemies: one
archetype, utility-scorer AI, no ranged AI, no groups, no bosses → 13
(archetypes/populations) + REGISTER (AI depth, boss behaviour — Xal-Krona) ·
weapon poisons/oils **decided at S round 4 but post-dates both 10c
deliverable lists — UNOWNED** · H2H knockout finisher **decided, UNOWNED** ·
combat audio: a literal no-op stub → 12b.

### D. Stats & progression (workstream S → 10c)
What 10c actually ships (both enumerations agree): the data-file port,
baseline-equivalence tests, the whole progression economy (Morrowind rank
costs, worthiness, vastei, level sittings, pace invariants), poise, potion
economy (estus removed), capability-profile regeneration, the actor + loot +
trap semantic compilers, enemy archetypes restated, character-sheet/level-up/
rest UI, the difficulty *knob*, the birthsign *slot*. Everything that is a
**verb** — brewing, enchanting, spellmaking, repairing, trading, training,
picking, sneaking, talking, saving, casting — ships its *math* at 10c and its
*system* later (register) or never got an owner (§3). Birthsign *contents*
(13 signs) explicitly deferred. The **vastei diegetic tutorial** (the Nisswo
scene, owner round-2 requirement) appears in zero quest docs — the packet
owning the game's opening owes it.

### E. Magic — settled vs not (the owner's magicka hunch, confirmed)
**Settled:** pools/regen numbers, six schools all casting through Willpower,
casting-never-fails + reliability margin, five tiers with damage/cost/time,
spellmaking KEPT (8 effects, fee formula), enchanting budgets/soul-size tiers/
learn-by-disenchanting, scrolls, 75 % cost-reduction cap, elemental damage
bypasses armour, `Wil/4 %` innate resist, no-crafting-fortify rule.
**Not settled / unowned:** the spell-effect catalogue (data has 4 placeholder
effects); the `StatEffect.field` enum (shape defined, legal fields never
listed); whether fire/frost/shock are separate resist channels (races
reference them; the ladder aggregates); the **casting verb** (slots/input,
concentration vs fire-and-forget, and **no rule for what incoming poise
damage does to a cast**); in-combat magicka regen rules; **soul gems + soul
trap + recharge mechanics** (enchanting is priced in soul sizes that have no
item model — and the "Argonian souls return to the Hist" ruling implies an
unresolved exception); summon stat blocks/cap/AI; the Atronach-sign variant.
Phase 13 requires a castable *enemy* slice — asserted in the register,
scheduled nowhere.

### F. Items & economy
Item generation (53 weapons / 35 armour / 48 arrows) + inventory rules + UI
BUILT · condition/wear/repair/temper 10c-math, no `condition` field in code
yet · barter/purse/trainer math 10c · loot provenance + placement 13 ·
catalogue breadth = 13/15 content · restock cycles, purse refresh, shop/
service UIs, income timers, finite fences → REGISTER (economy) · **guide
services + the hazard-preparation goods loop** (repellents, salves,
protective gear — module 30 §26's counterplay) **UNOWNED**, fold into the
economy row · water-breathing consumables are an **accessibility guarantee**
(00-core criterion 25) — the merchant economy must actually stock them.

### G. NPCs & AI
Ambient layer (marks, patrols, territories, schedules on the clock) 13 on
10b's nav bake · **detection service** — sneak XP, sneak openers,
Elusiveness-vs-Spot, RS02's watcher cones, MR04's disguise, blown-cover
states and the crime system ALL consume it; **no owner; pull-in awaiting
ratification at 10b kickoff. The single most load-bearing unowned system in
the repo.** · full stealth stack (stimuli, alert→search, distractions)
REGISTER · richer combat AI/bosses/morale/aquatic actions REGISTER · NPC
hearing ("what hears the player", 57 §105) rides the same service · creature
boat/tree use + amphibious traversal + moving root barriers UNOWNED (§4) ·
prior→roster demographic generation rule UNOWNED (Phase 11 will need a
working rule even if simple).

### H. Narrative runtime (the biggest build-out pillar)
Everything here is post-world-build by design; the world build owes sockets,
provisions, stable IDs and briefs. The quest plan demands, concretely:
quest state machine + typed blueprints (`narrative-core`) · **the typed
condition/action vocabulary — mandated, never enumerated; the only list (76
§125, 8 predicates) cannot express stage/journal/topic/evidence-absence/
custody/time/tier-lock gates. Authoring it is a Q1 gate** (now flagged in
quests 80 §58) · journal + content-format spec + an owner-approved exemplar
quest (gates Q2) · topic dialogue + KnowledgeState (topics, evidence,
witnessed events, region rumours, deliberate lies) · glossary artifact +
newcomer-topic coverage validator (Q0) · persuasion/disposition (authored
thresholds, never dice) · faction standing/rank/expulsion + telegraphed
senior incompatibilities · contract boards (support, never replace) ·
**allegiance reward tracks**: stat mods with trade-offs, granted abilities,
toll exemptions, a restricted-door flag class, **informant map markers**,
crime quashing, finite fences, fast-travel unlocks, income timers, an
**off-screen service request menu** — all "data, not behaviour" ·
**stronghold compositor** (3 phase layers + 4 allegiance overlays, services
per phase) · evidence system + **Eye custody invariant** ("cannot be
permanently lost"; custody ∈ player/reed/cult/hidden with authored presence
at each beat) · `essential` data-flag tier protection incl. DQ02's
tier-aware topic *deletion* · local world-state overlay runtime
(LocalStateVariant: refs/schedules/services/ambience; 2–3 per quest
location; the hard "may not" list — no terrain/hydrology/army simulation) ·
fail-forward successor system (**all NPCs killable, no invincibility flags**;
doom-warning message → depends on the save layer) · three-ending
availability computed from hidden accumulated state, headlessly simulable ·
staged scenes (2–6 speakers, survives a missed mark, stock animations only)
· delivery-tier machinery: waypoint-leash/teleport followers
invulnerable-in-transit, shared-timer static intercepts, ≤6 active hostiles
(validator on structured fields), pull-through-the-door verb + authored
survivor sets, aftermath pockets, readable-trail sites, disguise-as-flag ·
dream/vision harness (fog/light/audio/prop re-dress over existing cells;
≥3 quests + main-quest beats) · boss encounter system incl. the
evidence-driven **stand-down route** (a non-combat boss exit is a systems
feature) · grave-stakes province-wide interactable (biography text + bog
blight spawn) · `washed-out` NPC material-variant flag · crime-as-**Owing**
ledger (nushmeekos assessment, regional parameters, jails, audit/buy-out/
burn/pay — much bigger than "bounty") · scheduled travel **timetables as
real data** (every manhunt conversion is "read the departure boards and get
there first") · map with grantable persistent markers (in a no-quest-marker
game, the informant grant is the strongest reward) · narrative debugger in
the studio (12 named features, §64) + validator suite + LLM-critic checks +
headless branch simulation.

### I. Presentation & shell
HUD partial (sandbox) · inventory UI BUILT (Morrowind-skinned) · character
sheet/level-up/rest UI 10c · chargen UI REGISTER · main menu/settings/
rebinding/accessibility REGISTER · **save/load: no owner** — 10c's hook is
one `SaveGame` contract on rest; format/IndexedDB/slots/migration REGISTER;
the main quest's doom-warning message hard-depends on it · localization:
implicitly out of scope (nowhere stated — worth one explicit line some day) ·
soundscape 12b · **music/score REGISTER** (12b leaves the bus) · full VO
explicitly out (text-led; generic barks may use available audio).

### J. Explicitly out / hard-capped (for the record)
Level scaling · new art/animation/music authoring · companions ·
free-roam escorts/chases/crowds/boat-vs-boat (D-tier conversions instead) ·
on-screen rootworm (permanent) · province-scale simulation (armies, dynamic
floods, relocating cities) · runtime LLM · multiplayer/covenants (never
mentioned anywhere; treat as out) · dice anywhere · Luck · perk points ·
moveset unlocks/wield requirements · haggle minigame · whips/crossbows/
thrown/pickpocket · visible tidal-swing gameplay (~0.5 m built amplitude).

---

## 3. Load-bearing unowned gaps (recommended owners)

Ranked. "Owner" = recommendation, to ratify at the named kickoff or when the
build-out plan is drafted.

1. **NPC detection service** — three parts of the accepted stat design are
   unimplementable without it; crime, disguise and stealth quests sit on it.
   → thin cone model at 10b/10c (pull-in, pending ratification).
2. **Save/load layer** — rest-saves is decided; the quest plan's
   NPC-protection model literally tells the player to restore a save.
   → `SaveGame` contract at 10c; system = build-out milestone 1.
3. **Typed condition/action vocabulary** — "the only gate language" does not
   exist. → author at build-out Q1 gate (flag now lives in quests 80 §58).
4. **Renderer package extraction + real apps/game** — §1. → build-out
   milestone 1; stop-the-bleed hook now.
5. **Moveset wiring for kept weapon classes** — → 10b (pull-in, pending).
6. **Magic casting verb + effect-field enum + castable-enemy slice** — Phase
   13's D-bands need enemy casters; nothing schedules the slice. → decide
   enum + interruption rule by 10c; slice before 13.
7. **Weapon poisons/oils + H2H finisher** — decided at S round 4, missed by
   both 10c deliverable lists. → fold into 10c scope or register explicitly
   (now registered).
8. **Vastei diegetic tutorial scene** — owner-required, absent from the quest
   plan. → the packet that owns the opening (flag in the Phase 11/15
   co-design loop).
9. **Underwater POI access-metadata graph** (air pockets, return routes,
   gating tiers) — quests and 00-core's breath-manageable-by-design rule
   assume it. → Phase 12 companion to "underwater entrances", data schema
   with Phase 9's swim slice.
10. **Tide-gated access gameplay** — built data, no consumer; several POI/
    route designs assume it. → keep/cut call, then Phase 11/12 authoring
    vocabulary if kept.
11. **`WaterBody` per-body records** — 0025 deferred them *to* Phase 11;
    Phase 11's list omits them. → add at Phase 11 kickoff.
12. **Beyond-border land apron** — 55 §98b wants it "alongside Phase 10".
    → schedule or consciously re-defer at the Phase 10 gate.
13. **Artificial light sources** (torch/lantern/magelight) — dungeons phase
    12 and night gameplay assume them; "later phases" owns nothing.
    → design with 12's interiors; implementation likely build-out.
14. **Timetable data model** (boats/tides as queryable schedules) — → Phase
    11 ships schedule *data* with the service graph; runtime later.
15. **Prior→roster generation rule** — → Phase 11 kickoff (simple rule ok).
16. **AI-state across interior portals** — → with 10b nav/orchestration
    design notes; implementation build-out.

## 4. Ambitions needing an explicit keep / cut / defer ruling (batched, no urgency)

Module 30/60/75/92 design ambitions no phase owns; each should get a one-line
ruling by the phase that would own it (or at build-out planning): drifting/
floating settlements (30 §18 — quests already forbid relocating *cities*) ·
fire-in-a-wetland + `fireResponse`/`mudResponse` materials · river-pirate
boat-encounter system (partly superseded by the no-boat-vs-boat rule) · the
deferred boat tier (cargo/passengers/ownership/AI boats — "until a quest
demands"; `BoatStorageSocket` orphaned meanwhile) · boat nav constraints
(bridge clearance, obstacles) · mounts/horses · swamp-jelly husbandry ·
Hist systemic layer (dreams/memory threads/sap physiology — the dream
*harness* is registered; the systemic layer is not) · Hist hero-site root
motion + water/fog response · per-culture combat doctrine/taboo/burial
expression · festivals + ritual time gates · creature boat/tree use +
moving root barriers · wild wamasu ingestion (blocks quest FG03 or forces a
species amendment) · era-aware layering (moot under frozen 4E 201 — delete
from the data-model promises?) · demographics → language/clothing/food/
religion expression · rootworm-ride contract cleanup (`rootwormTransit`
LocomotionMode + organic-interior transition are orphaned by
talk-pay-arrive + never-seen rulings — recommend deleting the enum).

## 5. Likely future decisions (predict the merge points)

- **Magicka round 2** (the owner predicted this): casting verb/input, cast
  interruption vs poise, effect enum, elemental resist channels, soul-gem
  economy + the Argonian-soul exception, summons. Suggest one batched design
  round before 10c implements magic math.
- **10c calibration calls already flagged in-doc:** poise constants, ER-style
  hyperarmour on heavies, flat-vs-tiered i-frames, per-class crit table,
  Morrowind's literal `min(1+AR/dmg,4)` armour shape, the out-of-combat
  fatigue scalar (droppable), trainer-cost contradiction (§6).
- **Stats-sim watch items** (playtest, not data patches): late-game
  lethality ("after Act III nobody dies" → more D5 content, not softer
  numbers), non-social builds' Speechcraft floor vs duel-route endings,
  ~19 early-game deaths per simulated run.
- **Shield parry** (polish-backlog, 10b kickoff) · **difficulty screen** ·
  **localization: explicit out-of-scope line** · **goal reset + build-out
  master plan structure** when the world build closes (this doc + the
  register are the input; mirror docs/world/'s core/router/module shape).

## 6. Doc/data defects found (fixed vs recorded)

**Fixed 2026-08-30:** 76 §121.4 code block carried a stale `126 +
incomingDamage` (prose + curves.json say `135.6 + 0.6×dmg`; reference case
validates at exactly 25.0 %) · stale "OPEN DIVERGENCE" note in
`tooling/stats-sim/data/rules-argonia.json` (closed by FINDINGS #30) ·
quests 80 §58 now states the condition vocabulary is unenumerated (Q1 gate).

**Recorded, not resolved:** training price — 76 §124 says 10× current skill
(canon, matches its own worked figures); `economy.json` + the sim consume 8×;
one is wrong, and changing the harness side re-baselines validated numbers →
resolve at 10c · §121 subsection ordering (121.5 printed inside 121.1/121.2)
· `data/gear.json` is a mirror to delete at 10c (already documented) ·
orphaned contracts: `rootwormTransit`, `BoatStorageSocket` (§4).

## 7. Recommended build-out plan shape (sketch only — drafted properly at goal reset)

- **G0 — the game exists:** renderer extraction (`world-render`), real
  `apps/game` + deploy slice, save/load layer, detection service (if not
  pulled in), settings/menus shell. Everything after lands in the game app.
- **G1 — verbs:** casting system, crafting/service verbs (brew/enchant/
  spellmake/repair/train/trade), combat verb completion, full stealth stack,
  crime/Owing runtime, chargen.
- **G2 — narrative machinery:** condition vocabulary → narrative-core →
  dialogue/topics/journal → factions runtime → local-state overlays →
  reward tracks/stronghold → map/markers/discovery → narrative debugger +
  validators + headless sim. (The quest plan's own Q0–Q4 production sequence
  in quests 90 slots inside this and G3.)
- **G3 — content at scale:** quest production per region packet (co-design
  loop already binds it), enemy/boss AI depth, magic breadth, economy
  runtime, keep/cut ambitions that survived §4.
- **G4 — presentation & ship:** score, remaining audio, accessibility,
  onboarding/tutorialization, performance/browser hardening beyond Phase 14.

The world build's own remaining phases (10→15) proceed unchanged; the two
lists meet at the hooks recorded in the register.
