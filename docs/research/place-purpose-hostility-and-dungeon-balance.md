# Place purpose, hostility and dungeon balance — evidence and proposed vocabularies

Researched 2026-09-03 for the Phase 11 catalogue schema extension. Evidence:
UESP MediaWiki API category counts (project user-agent, 2026-09-03) and the
catalogue data itself. **Proposal only — the binding schema is
`worldgen/catalogue.py`.** Companion reading:
[morrowind-content-density](morrowind-content-density.md),
[openworld place distribution](openworld-place-distribution-and-siting.md),
world [70](../world/70-dungeons-interiors.md) (dungeon families),
[20 §12.2–12.3b](../world/20-province-design.md) (danger, reward-for-effort),
quests [85](../quests/85-condition-vocabulary.md) (the only legal gate language).

---

## 1. What the shipped games actually do

### 1.1 Hostility

| Game | Default-hostile places | Conditionally hostile | Mechanism |
|---|---|---|---|
| Morrowind | most caves (bandits, smugglers, beasts), ancestral tombs (undead), Daedric shrines (cultists + Dremora), Sixth House bases, Dunmer stronghold ruins | settlements: NPCs turn on **crime witnessed**, taunt-to-duel via Speechcraft, faction quest orders (Morag Tong writs make a *named* target legal), House war escalations | per-NPC `fight` value + crime/bounty per region guard faction; a place is hostile because its *occupants* are, not because of a place flag |
| Morrowind (mixed dens) | — | smuggler dens where the leader talks first (a bribe/persuade or a quest flag flips the whole den) | "fight or talk": the same cell reads as dungeon or as negotiation depending on approach |
| Skyrim | 249 of 456 discoverable places are **Clearable** (i.e. cleared of a hostile population); 93 are **Safe** | hold guards flip on bounty; Civil War flips fort ownership; Thieves'/DB questlines make specific settlements' NPCs attackable | faction relation matrix + crime gold per hold + quest-driven faction swaps on the *cell owner* |
| Gothic / Kenshi / Elden Ring | Gothic camps are guarded not hostile (warning, then force); ER sites mostly permanently hostile | joining one Gothic camp closes another; Kenshi relations shift on deeds (freeing slaves, killing patrols); ER invaders flip individuals | zone-based trespass rings; per-faction relation scalar, thresholded |

**Lessons.** Hostility belongs to the **occupying group** and the place inherits
it (swap the owner, swap the stance). Gothic's **warn→escalate trespass ring** is
what makes non-hostile-but-dangerous places interesting, and we have nothing like
it. Skyrim's useful number: **~55% clearable, ~20% explicitly safe**. Conditional
hostility must reuse the quests-85 predicates, never bespoke place logic.

### 1.2 Dungeon share

| Morrowind (Vvardenfell, ~410 named places) | n | Skyrim (456 discoverable) | n |
|---|---:|---|---:|
| Caves | 93 | Caves | 131 |
| Ancestral tombs | 92 | Nordic ruins | 85 |
| Mines (ore + egg) | 44 | Dwarven ruins | 50 |
| Daedric ruins | 38 | Military forts | 70 |
| Dwemer ruins | 26 | Mines | 25 |
| Grottos | 11 | Shipwrecks | 11 |
| **Dungeon-like subtotal** | **~304 (74%)** | **Clearable** | **249 (55%)** |
| Settlements | 35 (8.5%) | Cities+towns+settlements | 65 (14%) |
| Camps (Ashlander, non-hostile) | 14 | Bandit/Forsworn/giant/military camps | 65 |
| Landmarks, shipwrecks, misc | ~30 | Landmarks, farms, shacks, ships | ~72 |

Morrowind's 74% is inflated by ancestral tombs (2–4 rooms, a few skeletons —
our "minor delve" band); weighting them at half gives ~62%. **Convergent figure:
55–65% of named places are clearable interiors; 8–14% are settlements.**

---

## 2. Where our 527 plotted places stand

```python
# repo root; "plotted" == the 527 live records
import json, glob, collections
P=[p for f in glob.glob('world/sources/catalogue/places-*.json')
     for p in json.load(open(f))['places'] if p['workflow']=='plotted']
E={'cave-mouth','stair-throat','underwater-entry','grave-cut','hollow-trunk','burrow',
   'trapdoor','root-mouth','sinkhole-lip','cellar-door','well-shaft'}
d=[p for p in P if p.get('entrance') in E or p['classification']['class'] in ('lair','ruin')]
print(len(d), collections.Counter(p['classification']['class'] for p in d))
```

**197 of 527 (37%) are functionally dungeon-like** (dungeon entrance, or class
`lair`/`ruin`). Adding dungeon families that lack a dungeon entrance (`sithis`,
`the-dead`, `xanmeer`, `ayleid`, `submerged-way`, `illicit`, `depopulated`,
`lost-peoples`, `remnant`) gives **216 (41%)**.

| Region | dungeon-like (strict) | live plotted | share | hostile-camp records |
|---|---:|---:|---:|---:|
| dunmer-north | 49 | ~138 | 36% | 1 |
| hist-heartland | 49 | ~111 | 44% | 3 |
| imperial-fringe | 33 | ~121 | 27% | 2 |
| naga-kur-deeps | 22 | ~67 | 33% | 2 |
| saxhleel-coast | 17 | ~99 | 17% | 0 |
| mercantile-coast | 14 | ~140 | 10% | 2 |
| imperial-penal-south | 7 | ~70 | 10% | 0 |
| pirate-freeholds | 6 | ~53 | 11% | 0 |

Danger spread is healthy (D2 36 / D3 78 / D4 53 / D5 25) but the **coastal and
southern regions are badly under-served**; `pirate-freeholds` with zero hostile
camps and 6 dungeons is the clearest failure — a pirate region should be the
densest hostile ground in the province.

**Target.** The shipped 55–65% would mean ~290–340, which the owner warned
against, and our mix is far more settlement/civic than Morrowind's. Take the low
end, discounted: **240–280 dungeon-like of 527 (45–53%)** = **+45 to +85 over
today's 197**. Sub-targets:

| Band | Target | Note |
|---|---:|---|
| Major dungeons (multi-level, boss, 45+ min) | 20–28 | ~1 per 20 places; Phase 12 quest reservations count here |
| Standard delves (15–30 min, 1 level) | 90–120 | workhorse band |
| Minor delves (5–12 min, 2–5 rooms) | 110–140 | Morrowind's tomb band — cheap, high density value |
| …of which wet-majority interiors | ≤ 25% | owner: interiors majority dry land |
| …of which underwater entrance | 25–35 | wrecks, seabed cave-mouths, coastal trapdoors (world 60) |
| Hostile-baseline places (any class) | 130–170 | vs 20 hostile-camp records today |
| `sanctuary` places | 70–100 | Skyrim's 93 "Safe" — rest matters as much as threat |

---

## 3. Proposed `hostility` block

```jsonc
"hostility": {
  "baseline": "wary",              // enum, required
  "owner": "faction.pirate.blackwater",   // stable ID or null; inherits stance
  "trespassZones": [               // Gothic warn→escalate rings; optional
    { "zone": "inner", "stance": "hostile", "warning": "challenge-then-attack" }
  ],
  "flips": [                       // ordered; first matching flip wins
    { "to": "hostile",
      "when": { "any": [ { "questStage": ["quest.sq.reed-writ", "≥", 20] },
                         { "notorietyTier": ["region.gideon", "hunted"] } ] },
      "scope": "place" },          // place | occupantGroup | namedRole
    { "to": "friendly",
      "when": { "factionRankAtLeast": ["faction.pirate.blackwater", 2] } }
  ],
  "clearable": true,               // does clearing it change world state?
  "respawn": "slow",               // none | slow | seasonal | faction-refills
  "schemaVersion": 1
}
```

**`baseline` vocabulary (6):**

| Value | Meaning | Typical class |
|---|---|---|
| `hostile` | attacks on sight | lair, hostile-camp, sithis, illicit |
| `guarded` | tolerates approach, attacks on trespass/crime (Gothic ring) | martial, carceral, works, private estates |
| `wary` | neutral but low disposition; talks, easily provoked | outcast-settlement, tribal-village, expedition-camp |
| `neutral` | ordinary indifference | most transit, lone, civic |
| `friendly` | positive default; services, shelter | settlement, market, healing |
| `sanctuary` | violence-suppressed by rule or power; crime here is a *big* deal | hist, major temple, rite, refuge |

**`flips[].when` uses quests-85 predicates verbatim** — `questStage`, `flag`,
`deedCountAtLeast`, `factionRankAtLeast`, `owingAtLeast`, `notorietyTier`,
`settlementStandingAtLeast`, `daysSince`, `seasonIs`, `disguisedAs`, `npcAlive`
already cover every trigger the owner named (crime, membership, quest state,
time/season, trespass, deeds). Two terms should be *added to quests 85 §A*, not
invented here: `placeCleared(place)` and `placeStanceIs(place, enum)`.

**Relation to `dangerTier`:** orthogonal. `dangerTier` = how lethal (world 20
§12.2); `baseline` = who starts it. A D4 flooded cave with a leviathan is
`neutral`; a D1 toll gate can be `guarded`. Testable: `hostile` ⇒ `dangerTier ≥
D2`; `sanctuary` ⇒ `dangerTier ≤ D3` unless the danger is environmental.

---

## 4. Proposed `interior` block (Phase 12 placeholders)

```jsonc
"interior": {
  "kind": "delve",                 // none | building | delve | dungeon | complex | warren
  "family": "root-cavern",         // world 70 §47 family id
  "sizeBand": "S2",                // S0 single room … S4 multi-level complex
  "wetFraction": 0.25,             // 0–1 of floor area that is swim/wade
  "entranceCount": 2,              // ≥1; second entrance = a loop/shortcut reward
  "exteriorShell": true,           // is there an above-ground built exterior too?
  "verticalRelationship": "below", // below | behind | within | above-and-below
  "programRef": null,              // Phase 12 InteriorProgram id, null until authored
  "schemaVersion": 1
}
```

`family` = world 70 §47 verbatim (`xanmeer-complex`, `root-cavern`,
`flooded-cave`, `smuggler-den`, `kothringi-lilmothiit-site`, `ayleid-nedic-ruin`,
`imperial-fort`, `abandoned-plantation`, `hist-sanctum`, `sinkhole-ruin`).
Sizes: S0 = 1 room, S1 = 2–5, S2 = 6–14, S3 = 15–30, S4 = multi-level + boss;
§2's minor/standard/major map to S0–S1 / S2 / S3–S4.

---

## 5. Proposed `playerPurpose` block

### 5.1 Why the field is needed

BotW's triangle/gravity rule works only because each visible thing *promises a
different kind of payoff*; Elden Ring layers reward so a 3-minute catacomb and a
40-minute legacy dungeon read differently at a glance; Morrowind's rule was
"every cave has *something*"; RDR2's strangers are pure social drama. In all
four the designer knew, per site, **what experience it sells**. We record that,
and the plotter uses it to avoid repetition.

```jsonc
"playerPurpose": {
  "primary": "combat-challenge",   // enum, required, exactly one
  "secondary": ["lore-reveal", "unique-item"],   // 0–3, from the same enum
  "impact": "real",                // mild | real | major | province-changing
  "payoff": ["unique-item", "lore-fragment"],    // cleaned reward vocabulary
  "hookText": "text.place.<id>.hook",            // one-line promise, catalogue ref
  "schemaVersion": 1
}
```

**`primary`/`secondary` (16):** `service-hub`, `safe-rest`, `combat-challenge`,
`stealth-challenge`, `dungeon-delve`, `traversal-puzzle`, `vista-landmark`,
`navigation-aid`, `lore-reveal`, `faction-gateway`, `quest-anchor`,
`unique-item`, `resource-source`, `social-drama`, `wonder-oddity`,
`hidden-secret`. Folded: `trade-node` → `service-hub` + payoff `trade-access`;
`danger-telegraph` → secondary only (nothing should exist *only* to warn).

**`impact`:** `mild` (a minute's interest — Morrowind's minimum), `real`
(changes loadout, map knowledge or route for hours), `major` (an ability, a
faction door, a named artefact, a boss), `province-changing` (main-quest or
faction-terminal; ≤ 12 province-wide). Mix: mild ≤ 30%, real ~50%, major ~18%.

### 5.2 Cleaned reward vocabulary — 129 free-text kinds → 20

| New `payoff` value | Absorbs (from the 129 measured labels) |
|---|---|
| `trade-access` | trade, goods, rare goods, unique goods, market, coin, tolls, toll-service |
| `services` | services, repairs, mounts, transport, boats, ferry, storage, lodging, guides, unique service |
| `rest-shelter` | rest, shelter, safety, food, supplies, healing, magicka restoration |
| `training` | training, trainers, skill-teaching |
| `unique-item` | unique item, named-item, artefact, unique artefact, relic with provenance, relics, trophy, unique item (contested) |
| `gear` | gear, equipment, weapons, armour |
| `loot-cache` | loot, loot-cache, cache, treasure, salvage, grave goods, loot from the lost |
| `materials` | crafting material, materials, reagents, harvest, hides, hide, bone, feathers, eggs, fish, sap, sap draught, blight-craft |
| `resource-node` | extraction, ore, pearl beds, vakka |
| `enchanting-access` | enchanting, crafting, magic services |
| `lore-fragment` | lore, knowledge, unique-knowledge, documents, document, books |
| `map-knowledge` | vista, navigation, navigation-knowledge, travel-knowledge, beauty, spectacle |
| `route-unlock` | passage, access, travel, transit, shortcut, traversal shortcut, fast transit, fast-transit, climb, climb-route, climbing, climbing access, diving access, seasonal-access, traversal |
| `quest-hook` | quests, quest-hooks, quest hook, quest access, quest-critical, main quest, obligation hooks, grievance hook, faction hook, hidden site |
| `evidence` | evidence, quest evidence |
| `rumour` | rumour, information |
| `faction-access` | faction access, faction, faction standing, contracts, bounty, reputation, deed, faction consequence |
| `power-boon` | buff, blessing, power-slot, ability, grantAbility payloads |
| `named-foe` | boss, boss-encounter, unique encounter, combat, encounter, conflict, rivalry, hazard |
| `claim` | base, stronghold, claimable-ground, homestead |

`rewardProfile.valueTier` stays as the *magnitude*; `payoff` is the *kind*;
`impact` is the **experiential** band, validated as roughly monotone with
`valueTier` rather than duplicated.

### 5.3 How the plotter must use it

Scoring terms / gates for the greedy+repair plotter (`worldgen.macro_plot`):

1. **Anti-repetition along routes (hard gate).** Along a compiled road/lane, no
   three consecutive places share `primary`, and no two consecutive share both
   `primary` *and* `interior.family`. The most important rule — it is what stops
   20 POIs/km² becoming wallpaper.
2. **Rest cadence (hard gate).** Every `dungeon-delve` or `combat-challenge`
   with `dangerTier ≥ D3` must have a `safe-rest` or `service-hub`
   (`hostility.baseline ∈ {friendly, sanctuary}`) within 600 m of travel, or
   within 1200 m in D4–D5 where scarcity is the point.
3. **Hinterland completeness (hard gate).** Each M4/M5 settlement's 2 km
   hinterland must contain **at least 10 of the 16 primaries**, always
   including `dungeon-delve`, `combat-challenge`, `lore-reveal`, `safe-rest`
   and `resource-source`.
4. **Danger weighting (soft).** D4–D5 weights `combat-challenge`,
   `unique-item`, `wonder-oddity`, `hidden-secret` up and `service-hub` down;
   D0–D1 the reverse. Also drives the §2 per-region dungeon quota.
5. **Effort↔impact monotonicity (soft, world 20 §12.3b).** score ∝
   −|impact_rank − (effortToReach + remoteness)/2|; the orphan validator already
   rejects both tails.
6. **Hostility spacing (soft).** ≤ 3 `hostile`-baseline places within 800 m
   unless they share an `owner` (a bandit *territory* is good; three unrelated
   warbands in one valley is not).
7. **Visible-promise chain (soft, BotW gravity).** Each place has ≥ 1 place with
   a *different* `primary` in its `relations.visibleFrom` or within 400 m.

---

## 6. Proposed `contents` block (Phase 13 placeholders)

Lean, role-string-now / register-ID-later; Phase 13 (world 95) owns the registers.

```jsonc
"contents": {
  "creatures": [
    { "slotId": "c1", "role": "apex-ambusher", "registerRef": null,
      "danger": "D4", "count": "single", "trigger": "on-approach" }
  ],
  "npcs": [
    { "slotId": "n1", "role": "named-keeper", "registerRef": null,
      "faction": "faction.hist.rootspeakers", "named": true, "count": "single" }
  ],
  "loot": [
    { "slotId": "l1", "role": "hidden-cache", "registerRef": null,
      "payoff": "unique-item", "valueTier": "tier-4",
      "provenance": "left by the last diver who got this far" }
  ],
  "schemaVersion": 1
}
```

- `count`: `single | pair | few (3–5) | band (6–10) | swarm (11+)`.
- `role` from a seeded list — creatures: `apex-ambusher`, `pack-hunter`,
  `territorial-grazer`, `scavenger`, `swarm`, `guardian-boss`, `something-old`;
  NPCs: `named-keeper`, `lieutenant`, `rank-and-file`, `captive`, `merchant`,
  `hermit`, `quest-giver`.
- `registerRef` is `null` until Phase 13, then a stable ID (standard 2).
  Validator: non-null refs resolve; slot `danger` ≤ the place's `dangerTier`.
- ≤ 4 slots per place — a consistency record, not an encounter table.

---

## 7. Underwater set dressing — where it lives

| Concern | Current home | Verdict |
|---|---|---|
| Underwater POI *families* (wrecks, seabed hatches, sunken villas, root tunnels, ritual pools) | world [60 §"POI families"](../world/60-water-traversal.md) | **Has a home.** Feeds the catalogue directly; the `interior` + `underwaterAccess` fields carry it. |
| Underwater rendering (absorption, caustics, god rays) | world 60 §water stack, Phase 8b (closed) | Has a home. |
| Underwater *vegetation and groundcover* (kelp, seagrass, coral, weed beds) | **nowhere** — module 65's tier table and the flora palettes stop at the waterline; grep for `submerged`/`aquatic`/`seabed` in 65 returns nothing | **Gap.** Slot as a submerged depth band in module 65's scatter tiers (a `waterDepth` range on flora palette entries), authored in the Phase 10/15 scatter compiler; assets already scouted — Depths of Skyrim (world 90 §76) plus the round-4 leads in decision 0041 (SSE 70917 / 17267 / 26913). |
| Wreck and submerged-ruin *statics* | world 90 §"Ships and shipwrecks" (candidates) and 65's T1 hero-static tier | Partially homed; wrecks should be **catalogue places** (with `interior.kind` and `entrance: underwater-entry`), not scatter, so they get purpose and contents like everything else. |

**Action:** add a submerged depth band row to module 65's scatter tiers, and one
line to world 95's Phase 15 (or Phase 10 rollout) deliverables saying
coastal/river submerged dressing compiles with the terrestrial scatter pass. No
new phase needed.
