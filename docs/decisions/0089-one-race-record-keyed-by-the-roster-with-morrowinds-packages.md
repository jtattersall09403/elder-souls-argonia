# 0089 — One race stat record, keyed by the body roster's ids, carrying Morrowind's packages for both sexes

**Date:** 2026-09-24. **Status:** accepted (stats-lab lane lead, under the
lane brief's delegation to reconcile the two race tables, decision 0087
§1). Extends 0088; closes the "two race tables" item in the Phase 10c
starting state (phases README § Phase 10c).

## The two tables

| | `tooling/stats-sim/data/races.json` | `packages/game-core/src/actors/generated/races.json` |
|---|---|---|
| What it is | stat packages: attributes, skill bonuses, effects | the body roster: label, description, one built body per race and sex |
| Written by | workstream S, by hand | the asset pipeline, from Skyrim `RACE` records (decision 0054) |
| Ids | `orc` for the Orsimer | `orsimer` |
| Sexes | male baselines only | male and female |

## Decided

1. **One stat record: `packages/game-core/src/stats/data/races.json`**,
   keyed by the roster's race ids. The roster stays the record of bodies
   and is not duplicated; a test fails if the two id sets differ, so a
   race added to the roster without stats (or the reverse) cannot ship.
2. **Both sexes**, as module 76 §127 and 0054 require: `attributes.male`
   and `attributes.female`, from UESP *Morrowind:Races*.
3. **Morrowind's packages exactly**, as §127 states ("Argonian, exact";
   "other playable races port their Morrowind packages the same way"),
   with the Armorer → Smithing substitution of §118. Luck is dropped.
   Powers are an empty typed slot until the spells exist.
4. Names stay out of the stat record (standard 4): the lab reads them from
   the text catalogue.

## Every difference from the sim's table, and why

| Race | Sim | Record | Reason |
|---|---|---|---|
| all | id `orc` | `orsimer` | the roster's id (Skyrim's playable race); one key across bodies and stats |
| all | male only | male + female | §127 and 0054; values from *Morrowind:Races* |
| Nord | Agility 40 | 30 | canon (*Morrowind:Races*); the sim's 40 has no source |
| Altmer | Endurance 30 | 40 (male), 30 (female) | canon; the sim carried the female value |
| Dunmer | Long Blade 10, Marksman 10, Short Blade 5 | Long Blade 5, Marksman 5, Short Blade 10, Mysticism 5 | canon |
| Altmer | Alteration 10, Conjuration 10, Mysticism 5 | Alchemy 10, Alteration 5, Conjuration 5 | canon |
| Imperial | Long Blade 5 | Long Blade 10 | canon |
| Nord | Heavy Armor 10, Blunt 10, Long Blade 10, Axe 5, Block 5 | Axe 10, Blunt 10, Medium Armor 10, Heavy Armor 5, Long Blade 5, Spear 5 | canon (the sim also listed Spear 5; it had Block where canon has Medium Armor) |
| Orsimer | Blunt 10, Block 5, Smithing 10 | Block 10, Smithing 10 (canon Armorer), Axe 5, Heavy and Medium Armor 10 | canon; no Blunt bonus in canon |
| Redguard | Blunt 10, Axe 10 | Blunt 5, Axe 5, Short Blade 5 | canon |
| Altmer | weakness fire/frost/shock −25 as `weakness*` fields | resist magicka −50, fire −50, frost −25, shock −25 | canon; §127 writes weaknesses as negative `resist` magnitudes on the one stack |

Canon gives every race 45 points of skill bonuses; the sim's table gave
Imperials 40 and Redguards, Altmer and Orsimer 50. The record restores 45
for all ten. The sim's
tables are kept verbatim in `stats/__fixtures__/sim-data/` for the
equivalence proof, which runs on them; the standing invariants run on
this record.
