# The typed condition/action vocabulary

> Module of the quest/narrative master plan (see [README](README.md)).
> Established by decision
> [0042](../decisions/0042-buildout-steers-and-engineering-standards.md);
> engineering standard 1 in [engineering-standards.md](../engineering-standards.md).

**This is the only language a quest may gate or change the world in.** Every
stage requirement, dialogue availability, faction check, reward grant, journal
entry and local-state override compiles to the terms below. Nothing is written
in prose and translated later.

**This document is deliberately alive.** An author who needs a predicate that is
not here **adds it here first**, with a one-line justification, and then uses
it. Adding a term is cheap; a hundred bespoke prose conditions are not. What is
*not* allowed is authoring a gate that names no term.

**Design rules that constrain the whole vocabulary:**

- **No dice, anywhere** (00-core). Every predicate is deterministic given world
  state. Persuasion is an authored threshold, never a roll.
- **Everything is headlessly evaluable** (standard 5). A predicate may not
  require a camera, a renderer, an input device or a frame.
- **Actions are data, never behaviour** (30 §24b.6). An action sets a flag,
  grants an item, moves a marker or enables a ref — it does not run a script.
- **Every reference is a stable ID** (standard 2).

---

## A. Predicates (conditions)

Grouped by what they read. Types: `id` = stable ID, `int`, `bool`, `enum`.

### A1. Quest and stage state

| Predicate | Args | Reads |
|---|---|---|
| `questStage` | quest `id`, `op`, stage `int` | the stage a quest is on (`op` ∈ `=  ≠  ≥  ≤  <  >`) |
| `questState` | quest `id`, `enum{unstarted,active,complete,failed}` | coarse quest state |
| `stageEverReached` | quest `id`, stage `int` | whether a stage was ever passed, even if the quest moved on |
| `objectiveComplete` | quest `id`, objective `id` | a single objective within a stage |

### A2. Flags and counters

| Predicate | Args | Reads |
|---|---|---|
| `flag` | flag `id`, `bool` | a named world flag |
| `counterAtLeast` | counter `id`, `int` | any authored counter |
| `deedCountAtLeast` | faction `id`, deed class `id`, `int` | the silent-unlock counters adopted by 0039 |
| `firstTime` | marker `id` | true exactly once, then latches false (for one-shot lines) |

### A3. Knowledge, topics and evidence

| Predicate | Args | Reads |
|---|---|---|
| `knowsTopic` | topic `id` | the player's KnowledgeState |
| `topicHeardFrom` | topic `id`, npc `id` | who told them — the basis of catching a lie |
| `witnessed` | event `id` | the player personally saw it |
| `hasEvidence` | evidence `id` | possession of an evidence item |
| `evidenceState` | evidence `id`, `enum{pristine,copied,altered,destroyed}` | tampering |
| `custody` | artifact `id`, `enum{player,reed,cult,hidden}` | the Eye custody invariant |
| `rumourActive` | rumour `id`, region `id` | regional rumour pools |

**Absence is first-class.** Every predicate in this group may be negated (§D),
because "they have *not* heard this" is the most common gate in a topic-driven
game and prose conditions habitually forget it.

### A4. Character, stats and inventory

| Predicate | Args | Reads |
|---|---|---|
| `hasItem` | item `id`, `int` count | inventory |
| `wearing` | item `id` *or* slot `id` + tag `id` | worn gear — the basis of disguise |
| `skillAtLeast` / `attributeAtLeast` | stat `id`, `int` | 76's stat block. Used for *authored thresholds*, never rolls |
| `levelAtLeast` | `int` | discouraged — prefer a deed or skill gate (no level scaling, 0004) |
| `raceIs` / `signIs` / `sexIs` | `id` | flavour and reactions only; **never gates completion** (race-neutral rule) |
| `goldAtLeast` | `int` | prices, bribes, tolls |
| `carriedValueAtLeast` | `int` | contraband and customs checks |

### A5. Factions, standing and crime

| Predicate | Args | Reads |
|---|---|---|
| `factionRankAtLeast` | faction `id`, rank `int` | rank ladder |
| `factionStandingAtLeast` | faction `id`, `int` | disposition-style standing |
| `expelledFrom` | faction `id` | expulsion state |
| `dispositionAtLeast` | npc `id`, `int` | per-NPC disposition (76 §125) |
| `owingAtLeast` | region `id`, `int` | the crime-as-Owing ledger, **per region** (0039) |
| `notorietyTier` | region `id`, `enum` | notoriety bands |
| `settlementStandingAtLeast` | settlement `id`, `int` | the customs/favours ladder (0039 S5) |

### A6. World, place and time

| Predicate | Args | Reads |
|---|---|---|
| `inRegion` / `inSettlement` / `inCell` | `id` | where the player is |
| `discovered` | poi `id` | discovery state |
| `localVariantActive` | location `id`, variant `id` | local world-state overlay |
| `timeOfDay` | `enum{dawn,day,dusk,night}` *or* hour range | the world clock |
| `dateAfter` / `dateBefore` | calendar date | the canon calendar |
| `daysSince` | event `id`, `int` | cooldowns, amnesty decay, reprisal timers |
| `seasonIs` | `enum` | seasonal content |
| `weatherIs` | `enum` | 8c's published local weather |
| `tideState` | `enum{low,high}` | **flavour only** — tide gating is CUT (0042 §2) |
| `placeCleared` | place `id` | the catalogue's `hostility.clearable` state (Phase 11 v2, 2026-09-03) |
| `placeStanceIs` | place `id`, `enum{hostile,guarded,wary,neutral,friendly,sanctuary}` | the place's current stance after any `hostility.flips` (same vocabulary as the catalogue's `hostility.baseline`) |

### A7. NPC and actor state

| Predicate | Args | Reads |
|---|---|---|
| `npcAlive` | npc `id` | fail-forward successors depend on this |
| `npcInCustody` | npc `id` | |
| `npcAtMark` | npc `id`, mark `id` | staged scenes that must survive a missed mark |
| `successorActive` | role `id`, npc `id` | which NPC currently fills a role |
| `detectedBy` | faction `id` *or* npc `id` | the one detection service (standard: never per-enemy checks) |
| `disguisedAs` | faction `id` | disguise-as-flag |

### A8. Tier protection

| Predicate | Args | Reads |
|---|---|---|
| `tierProtected` | thing `id` | the `essential` data-flag tier (quests 40 §30b) — read by the runtime, not by authors, but listed so tier-aware topic *deletion* (DQ02) has a term |

---

## B. Actions

Actions are the only way authored content changes the world. Every one is data.

### B1. Quest and state

`setStage(quest, stage)` · `completeQuest(quest)` · `failQuest(quest)` ·
`setFlag(flag, bool)` · `addCounter(counter, int)` · `startTimer(event)`

### B2. Knowledge and journal

`grantTopic(topic)` · `removeTopic(topic)` *(tier-aware)* ·
`addJournalEntry(quest, entry)` · `recordWitnessed(event)` ·
`seedRumour(rumour, region)` · `grantGlossaryTerm(term)`

### B3. Items, rewards and money

`giveItem(item, count)` · `takeItem(item, count)` · `giveGold(int)` ·
`takeGold(int)` · `grantAbility(ability)` *(once-per-day powers, incl. Hist
communion — 0042 §1)* · `grantMapMarker(marker)` · `setPrice(service, int)` ·
`grantServiceAccess(service)` · `setDoorAccess(door, enum)`

### B4. Factions, crime and standing

`setFactionRank(faction, rank)` · `changeStanding(faction, int)` ·
`expel(faction)` · `changeDisposition(npc, int)` · `addOwing(region, int)` ·
`clearOwing(region)` · `setNotoriety(region, tier)` ·
`changeSettlementStanding(settlement, int)`

### B5. World and scene

`applyLocalVariant(location, variant)` · `clearLocalVariant(location, variant)`
· `enableRef(ref)` · `disableRef(ref)` · `moveRef(ref, mark)` ·
`setSchedule(npc, schedule)` · `setAmbience(location, ambience)` ·
`setMaterialFlag(npc, flag)` *(e.g. `washed-out`)* · `startScene(scene)` ·
`sendCourier(letter)` · `promoteSuccessor(role, npc)`

**The hard "may not" list** (quests 20 §14, restated because it is the boundary
that keeps this vocabulary implementable): no action changes terrain, hydrology,
region data, weather systems, city locations or population at province scale. A
quest re-dresses; it does not re-simulate.

---

## C. The content-unit shape (engineering standard 11)

Letters, rumours, books, notes, journal entries, dialogue lines and barks are
**one type with one shape**:

```jsonc
{
  "id": "letter.gideon.reed-inheritance",   // stable ID (standard 2)
  "type": "letter",                          // letter|rumour|book|note|journal|dialogue|bark
  "text": "text.letter.gideon.reed-inheritance",  // catalogue reference (standard 4)
  "speaker": "npc.gideon.spills-the-ink",    // or null for authorless text
  "available": [ /* predicates from §A */ ],
  "onDelivered": [ /* actions from §B */ ],
  "keys": { "region": "region.gideon", "topic": "topic.the-owing" },
  "schemaVersion": 1                          // standard 7
}
```

Why one shape: the validators, the voice review, the discovery feed and the
courier channel all then operate on one table rather than seven.

---

## D. Composition

Conditions compose with `all` (AND), `any` (OR) and `not`. No other operators —
nesting is allowed, arithmetic is not.

```jsonc
"available": {
  "all": [
    { "questStage": ["quest.mq.05", "≥", 20] },
    { "not": { "knowsTopic": "topic.the-third-name" } },
    { "any": [
      { "factionRankAtLeast": ["faction.veiled-reed", 3] },
      { "deedCountAtLeast": ["faction.veiled-reed", "deed.quiet-favour", 3] }
    ]}
  ]
}
```

## E. Gates on this document

- **Q0** — the glossary/newcomer-topic coverage validator reads §A3 terms.
- **Q1** — no authored condition may name a predicate absent from §A; no action
  may name a term absent from §B. This is the gate that makes the vocabulary
  real (quests [80 §58](80-technical-architecture.md)).
- **Build-out G2** — `narrative-core` implements exactly this list, and its
  first test is a headless run of the exemplar quest (standard 5).
