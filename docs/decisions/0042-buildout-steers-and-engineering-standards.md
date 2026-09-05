# 0042 — Build-out steers, the §4 ambitions batch, and eleven engineering standards

Date: 2026-09-01. Owner rulings, given in one round against the build-out
register and the [systems audit](../research/combat-and-systems/game-buildout-systems-audit.md).
This record closes every item the register listed as *awaiting a ruling*, moves
two pieces of work into named phases, and establishes eleven standing
engineering standards (their live statement is
[engineering-standards.md](../engineering-standards.md) — read that, not this).

## 1. Hist-site communion powers — **KEPT**

Drinking sap at a **hero Hist** grants a **once-per-day power**, using the
existing power/effect-stack semantics — no new system, no new verb. Which power
depends on the tree; ~10 trees, so it is a collectible reason to walk the
province.

**Race-neutral, as the owner's original constraint required:** anyone may drink.
Argonians get different flavour text and a dream, never different mechanics, and
no content is gated on being Argonian.

Owner: build-out (the powers themselves are effect-stack data); the *trees* are
placed by Phase 11 and must carry a stable ID and a power slot in their record.
This absorbs the "Hist systemic layer" ambition below — the dream harness is
already registered; the physiology simulation is not pursued.

## 2. The audit §4 ambitions batch — all ruled

| Ambition | Ruling |
|---|---|
| Drifting/floating settlements | **CUT** — a permanently moored raft village reads identically; quests already forbid relocating cities |
| Fire spreading in a wetland (`fireResponse`) | **CUT** — expensive simulation, wet province, nothing asks for it |
| River-pirate boat-encounter system | **CUT as a system** — pirates survive as shore ambushes (the no-boat-vs-boat rule already removed the interesting half) |
| Deferred boat tier (cargo/passengers/ownership/AI boats) | **DEFER** to build-out G3; **delete `BoatStorageSocket`** meanwhile (orphaned) |
| Boat nav constraints (bridge clearance, obstacles) | **KEEP — cheap**: an authoring rule at Phase 11, not a system. Bridges over navigable water get clearance; obstacle placement respects lanes |
| Mounts/horses | **CUT** — wrong province; swamp, water and boats are the traversal identity |
| Swamp-jelly husbandry | **CUT as a system**; survives as scenery and lore |
| Hist systemic layer (dreams/memory threads/sap physiology) | **DEFER**, folded into §1 above + the registered dream harness |
| Hist hero-site root motion / water + fog response | **KEEP as set dressing** at the ~10 hero sites — a bespoke effect, not a system. Phase 11/12 |
| Per-culture combat doctrine / taboo / burial **expression** | **KEEP as content** — enemy loadouts, graveyard dressing, naming. Authoring, not code (the customs/standing *mechanic* was already adopted, 0039 S5) |
| Festivals + ritual time gates | **DEFER** to build-out G3 — the calendar exists; cheap later, expensive now |
| Creature boat/tree use; moving root barriers | **CUT** |
| Wild wamasu (was blocking quest FG03) | **RULED: wild wamasu exist**, deep marsh only. FG03 stands unamended; the species becomes a marquee apex predator for Phase 13 |
| Era-aware data layering | **DELETE the promise** from the data-model docs — moot at a frozen 4E 201 |
| Demographics → language/clothing/food/religion expression | **KEEP as an authoring rule** at Phase 11 |
| Tide-gated access gameplay | **CUT the gating** — the built tidal amplitude (~0.5 m) cannot carry a gated door. Tide stays visual/flavour |
| Orphaned `rootwormTransit` locomotion mode | **DELETE** (as recommended in the audit) |

## 3. Renderer extraction → **Phase 14**, not the build-out

The ~7,300 LOC of game-runtime renderer still living app-private in
`apps/world-studio/src` (sky/light, water pipeline, weather expression, terrain
streaming, vegetation, character driver) is extracted into a shared
`world-render` package **at Phase 14**, not deferred to build-out milestone G0
as the audit recommended.

Rationale (owner accepted): Phase 14 is *about* how the game loads and ships, so
it has to touch exactly this code anyway; extracting there means Phase 15's
regional rollout produces content for the real game app rather than for a studio
that is subsequently rewritten. The audit's structural hazards still apply —
extract as **one** package first (the sky/water/weather/terrain import cycle is
coupled by mutable module-level singletons), and re-validate anything tuned
under the studio's paused-by-default clock against `GAME_TIME_SCALE = 30`.

The standing stop-the-bleed rule (CLAUDE.md; 0038 addendum 2) is unchanged and
now has a mechanical check (standard 8).

## 4. Polearm sourcing → **Phase 10b**, with the wiring

Clip sourcing for the kept polearm classes moves from Phase 10 to **10b**, done
in the same pass as moveset wiring: auditioning clips you are about to wire is
one playtest instead of two. Top source unchanged
([90 §74.3](../world/90-asset-strategy.md)): **Animated Armoury (SSE 35978)** —
rapier/pike/halberd/quarterstaff/claw/katana meshes plus loose-`.hkx` player
*and* NPC movesets, permissions verified ("just credit NickaNak", conversions
allowed); with Animated Heavy Armory (51100) and Skyrim Spear Mechanic (25146).

Current state this fixes: `spear`, `halberd` and `staff` exist as weapon classes
but borrow the `greatsword`/`greataxe` movesets, so a spear swings rather than
thrusts.

## 5. Combat proving round → a named **Phase 10c** deliverable

A bounded creature/archetype proving round, sequenced at the *end* of 10c so it
measures calibrated numbers rather than placeholders:

- **Machine does the sweep.** `tooling/stats-sim` runs every enemy archetype
  against a fixed set of preset builds (heavy brawler, light dodger, archer,
  caster, sneak) and reports outliers — unhittable enemies, trivial enemies,
  builds that hit a wall.
- **Owner playtests only the flagged cases**, plus one deliberate sample per
  feel category (fast swarmer, slow heavy, ranged, one boss). Target ~a dozen
  fights, not hundreds. A preset-loadout picker in the sandbox is part of the
  deliverable.
- **Bosses are authored, not tuned.** One boss prototype (Xal-Krona) is built
  and playtested during the build-out and sets the pattern; 10c does not try to
  balance bosses.

## 6. Morrowind voice for all text → a register row and a standing rule

AI-written prose reaches for gravitas and produces constructions nobody writes
(owner's example: *"a root the story grew along is severed"*). TES prose is
plainer than people remember — short declaratives, concrete nouns, archaism
carried by vocabulary and idiom, not by twisted syntax.

Adopted, as a **three-stage requirement, not a late cleanup**:

1. a **voice research pass** deriving a rulebook from the actual TES corpus
   (register, sentence length, permitted archaism, per-culture and per-class
   speech, how *system* messages sound);
2. the rules **bind every text-producing agent** as an input, not a review;
3. an **independent voice-review agent** — separate from the writer by design,
   because a writer will not catch its own register — checks written text
   against the rulebook and proposes the specific edit.

Plus a **banned-constructions list** that grows whenever the owner spots one
(entry 1 is the example above), kept in
[quests/60 §45e](../quests/60-writing-and-lore.md). Standard 4 (one text
catalogue) is what makes stage 3 mechanically possible — the reviewer sweeps one
catalogue instead of hunting through code.

## 7. HUD and UI consistency — an explicit row, not folded into the shell

The owner asked whether consistent HUD/UI design was covered. It was not,
explicitly: the audit had a "menus, settings, accessibility" shell row and
scattered per-screen items (inventory, character sheet, journal, map, barter),
with no owner for **the design system they must share**. Now a register row of
its own: one token set, one component layer, one input model (mouse/touch/pad),
one Morrowind-derived visual language, defined **before** the second screen is
built. The inventory UI (already Morrowind-skinned and shipped) is the seed the
token set is extracted *from*.

## 8. Eleven engineering standards

The owner's instruction: *"make all 11 of these happen, with whatever
checks/tests/hooks/rules are needed"*. They are stated, with their enforcement
and their owning phase, in **[engineering-standards.md](../engineering-standards.md)**.
Summary of what shipped with this decision versus what is a scheduled hook:

| # | Standard | Shipped now |
|---|---|---|
| 1 | Typed condition/action vocabulary authored before Phase 11 places anything | **first cut authored**: [quests/85](../quests/85-condition-vocabulary.md) |
| 2 | Stable IDs + an ID registry from the first placed object | rule + registry format + uniqueness check |
| 3 | `owner`/`ownerFaction` + value tier ship *with* placement | rule (Phase 11 hook, already registered) |
| 4 | Every player-visible string lives in one keyed text catalogue | `packages/text-catalogue` + duplicate/ID checks |
| 5 | Quest runtime headlessly drivable from day one | rule, asserted at the narrative-core kickoff |
| 6 | Determinism: no wall-clock/unseeded randomness in world building | **check** (`repo-standards`) |
| 7 | Every data bundle carries a `schemaVersion` | rule + check over the declared registry |
| 8 | No new module-level mutable singletons in `packages/` | **check** (`repo-standards`) |
| 9 | Creature/actor statblock schema before Phase 13 places creatures | rule (10c hook, already registered) |
| 10 | Asset provenance: source + hash + credit in the same change | **check** (credits coverage) |
| 11 | One content-unit convention for letters/rumours/books/journal/dialogue | convention defined in [quests/85](../quests/85-condition-vocabulary.md) §C |

The three that are pure future-phase hooks (3, 5, 9) were already register rows;
this decision makes them binding standards rather than recommendations.
