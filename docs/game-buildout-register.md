# Game build-out register (the systems seam)

The world-build master plan deliberately builds **only as much of the game's
systems as the world build needs** — contracts, thin slices and calibration
data, never finished systems (the established pattern: capability profiles
75 §52, Phase 9's "thin contract with defaults", semantic authoring 76 §128,
the quest plan's typed condition vocabulary). Everything past that line
belongs to the **next goal** — building the world and its proven systems out
into the full game — whose master plan will be drafted when the world build
closes and the owner resets CLAUDE.md § GOAL. Policy: decision
[0038](decisions/0038-world-build-vs-game-buildout-seam.md).

This file is that future plan's seed, and the systems twin of
[polish-backlog.md](polish-backlog.md) (which holds cosmetic/feel leftovers
for Phase P — not systems). One row per deferred system: what the world build
already owns, what is deferred, and the **hook** — the contract or data the
owning world-build phase must leave behind so the deferred work stays cheap.
**A world-build phase that touches a row and ships without its hook is not
done.** Owner and agents add rows freely; shrink or delete rows as phases
absorb them.

## Recommended pull-ins — world-build scope, owner ratifies at the named kickoff

- **Full movesets for the kept weapon classes** (Blunt, Axe, Spear/pike/
  halberd/staff, Short Blade, unarmed — chassis taxonomy per 0031). Clip
  *sourcing* is already a registered Phase 10 job with verified candidates
  (90 §74.3: Animated Armoury, Animated Heavy Armory, Skyrim Spear Mechanic).
  Recommendation: wire clips into combat at **10b** (it already fixes shared
  combat internals and runs the combat-space probes — a halberd needs more
  clearance than a sword, so probing with only 1H+bow under-measures), class
  numbers land at **10c** (gear.json port), all before **13** (enemy
  archetypes fight with these classes). Ratify at 10b kickoff.
- **Minimal NPC detection model** (view cones + seen/unseen state, one
  service). The accepted stat design already depends on it — sneak XP ticks
  on "inside a detection cone, not seen" (76 §120.1), sneak-opener bands
  (76 §121.5), Elusiveness-vs-Spot (76 §120 Sneak row) — but **no phase owns
  it** (gap found 2026-08-30; module 72 is nav-only by design). Recommendation:
  lands with 10b's enemies or at 10c, before Phase 13 authors encounters.
  The full stealth stack stays deferred (table below).
- **Shield parry ruling** — logged in [polish-backlog.md](polish-backlog.md)
  tagged `10b` (feel item; that mechanism already existed).

## Deferred systems

| System | World build owns (where) | Deferred to build-out | Hook the world build must leave |
|---|---|---|---|
| **Stealth, full stack** | detection math + sneak bands designed (76 §120/§121.5); ambient-AI marks/patrols/territories data (72, Phase 13); minimal cone model per pull-in above | light/sound stimuli, alert→search→give-up behaviour, distraction verbs, crime response integration | one detection *service* consulted by all NPC logic, never per-enemy ad-hoc checks; NPC schema keeps its Spot-side stats (76 §129) |
| **Quest engine + journal** | quest master plan (docs/quests/), Milestone-1 world provisions, sockets (75 §56), stable semantic IDs, co-design briefs per packet | runtime: flag store, scene scripting, journal UI, topic-driven dialogue, the 24-quest main line and all faction lines as playable content | the typed condition vocabulary (quests 80 §58) stays the *only* gate language; every placed thing keeps its stable semantic ID |
| **Dialogue/interaction UI** | Phase 11 needs a minimal talk verb (Morrowind-style travel services: talk-pay-arrive; merchant open-shop via MerchantSocket); persuasion math designed (76 §125) | topic web, full dialogue UI, disposition-moving conversation verbs (admire/bribe…), text presentation at Morrowind density | Phase 11 ships talk→service-menu as a small *contract*, not a bespoke ferry hack, so the full dialogue system later replaces one seam |
| **Save/load & persistence** | save-on-rest is the decided design (0031, 76 §126) and 10c implements rest; **nothing else — no phase owns a save layer (gap found 2026-08-30)** | versioned save format, browser persistence (IndexedDB) + export/import, save-slot UI, migration policy across content updates | 10c puts rest→serialize behind one `SaveGame` contract for *player* state; world state stays in versioned bundles + sparse local-state variants (Phase 14, quests 20 §14) so saves reference world data, never copy it |
| **Magic, player-facing breadth** | S designed the magic model on the effect stack (76); 10c implements the math; Phase 13's D-bands need *castable enemy* magic, so a working combat slice exists by 13 | spell acquisition (vendors/factions), spellmaking/enchanting service UIs, Morrowind-scale spell list | casting clips + spell FX are sourcing jobs (90 §71 — vanilla has both); Phase 10's registry sweep tags them; all effects go through the one effect stack |
| **Enemy & boss AI depth** | sandbox combat AI ports at 10b; territories/leashes on baked nav (72/13); archetypes restated on the D-ladder (76 §128) | DS-style boss behaviour (Xal-Krona — research/last-warden-boss-options.md), group tactics, morale/flee, aquatic combat behaviours (75 §57) | AI reads only baked nav data + the NPC schema; boss movesets are sourced-clip jobs (creature clip inventories already surveyed) |
| **Factions runtime, crime & bounty** | FactionStanding schema (quests 40 §27–28), disposition (76 §125), faction territories (Phase 4), full cast (quests 35/36) | rank advancement runtime, crime detection/bounty/response, Owing enforcement mechanics | standing/crime gates stay inside the typed condition vocabulary; crime detection reuses the single detection service (stealth row) |
| **Economy runtime** | barter math (76 §124), merchant sockets (75 §56), fixed loot provenance (13) | restock cycles, gold sinks/faucets tuning at full-game scale | merchant stock = loot IDs through the semantic compiler; never a parallel item system (75 §56) |
| **Character creation & onboarding** | races + birthsign hook + specialization data at 10c (76) | chargen UI flow (race/specialization/birthsign), intro sequence, tutorialization | 10c keeps race/birthsign/class data fully data-driven so chargen is UI over existing data |
| **Menus, settings, accessibility** | the authored difficulty setting ships at 10c (76 §121.6); studio debug UI exists | main menu, settings screens, key rebinding UI, accessibility options | input stays behind `PlayerMovementController`/adapter; bindings data-driven |
| **Music / score** | nothing — explicitly out of world-build scope (57) | the whole score: sourcing (no-new-art applies to music too), explore/combat layers, region themes | 12b's `AudioManager` leaves a music bus and ducking hooks |

**Not rows:** catalogue *breadth* (weapons, armour, uniques, artefacts, books)
is **content**, not a system — it lands through Phase 13/15 packets and quest
briefs via the semantic compiler. The item *data architecture* that must carry
it at Morrowind scale is 10b/10c work under the CLAUDE.md scaling rule.

When the world build closes: the owner resets CLAUDE.md § GOAL, and the first
build-out task is turning this register into a modular master plan of its own
(mirror the docs/world/ structure — a core, a router, modules).
