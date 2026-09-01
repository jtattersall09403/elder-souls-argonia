# Technical narrative architecture and validation

> Module of the quest/narrative master plan (see [README](README.md)).
> Nothing here is built during world generation (no speculative contracts).

# Part XII — Technical narrative architecture and validation

## 57. Runtime package placement

Quest code begins after world-generation exit criteria are met.

Likely later packages:

```text
packages/
  narrative-core/       # state machine, conditions/actions, journal
  faction-core/         # membership, rank, reputation, incompatibility
  dialogue-core/        # topics, responses, knowledge and rumours
  world-state/          # bounded local state overlays
  quest-validation/     # graph/static validators

content/
  quests/
  factions/
  dialogue/
  books/
  rumours/
```

Do not add these speculatively during current world generation.

## 58. Quest blueprint

```ts
interface QuestBlueprint {
  id: string;
  title: string;
  family: "main" | "faction" | "regional" | "standalone";
  era: string;
  loreRefs: string[];

  prerequisites: ConditionExpr;
  startNodes: string[];
  stages: QuestStage[];
  endings: QuestEnding[];

  worldProvisionIds: string[];
  factionEffects: FactionEffect[];
  localStateEffects: LocalStateEffect[];
  fixedRewards: RewardSpec[];

  failForward: FailForwardSpec[];
  validationTags: string[];

  // Every twist names the stage(s) that seed it, so "seeded" is statically
  // checkable; whether the seeding *lands* is LLM-critic work (§63b).
  twists: { id: string; seedStageIds: string[] }[];
  // Tier protection (§63, Tier protection): every shared id this quest reads
  // or writes — NPCs, LOCs, STATEs, items, topics, evidence, variables.
  touches: { id: string; access: "read" | "write" }[];
}

interface QuestStage {
  id: string;
  objectives: ObjectiveSpec[];
  enterWhen: ConditionExpr;
  completeWhen: ConditionExpr;
  onEnter: NarrativeAction[];
  onComplete: NarrativeAction[];
  optionalObjectives?: ObjectiveSpec[];
  successorStageIds: string[];
}
```

Conditions and actions must come from a finite typed vocabulary. Avoid arbitrary per-quest script code.

**The vocabulary is [85-condition-vocabulary.md](85-condition-vocabulary.md)**
(authored 2026-09-01, decision
[0042](../decisions/0042-buildout-steers-and-engineering-standards.md);
engineering standard 1). It supersedes the eight stats-facing predicates in
world module 76 §125, which could not express stage/journal state, topic
knowledge, evidence *absence*, artifact custody, local-state variants,
time-of-day or tier-lock status.

It is a **living list**: an author needing a predicate that is not there adds
it there first, then uses it. The **Q1 gate** is now a check rather than a
drafting job — no authored condition may name a predicate absent from §A, and
no action a term absent from §B.

## 59. Dialogue and knowledge

```ts
interface KnowledgeState {
  knownTopics: Set<string>;
  evidenceHeld: Set<string>;
  witnessedEvents: Set<string>;
  rumoursByRegion: Record<string, Set<string>>;
}

interface DialogueResponse {
  id: string;
  speakerId: string;
  topicId: string;
  conditions: ConditionExpr;
  text: string;
  playerOptions: PlayerLine[];
  effects: NarrativeAction[];
}
```

NPC knowledge should reflect:

- role and location;
- personal experience;
- faction access;
- public rumours;
- documents received;
- deliberate lies;
- time and world state.

## 59b. The glossary artifact

The lore-onboarding validator (60 §45d, §63) checks against a single small
file: **docs/quests/57-glossary.md** (created at Q0, not before). One row per
term: term · one-line newcomer gloss · Act-I-available flag · optional
`opaque` flag. Entries are **limited to load-bearing/stakes-bearing proper
nouns** — the ones a newcomer needs to weigh a quest's stakes or the main
choice — never a general lore index. An `opaque` entry is deliberate wonder
content: its topic returns folk speculation, never truth, and it is exempt
from newcomer-topic coverage. **Update-in-the-same-change rule**: any change
that introduces or retires a load-bearing noun updates the glossary in the
same change.

## 60. Local world state

Use sparse overlays:

```ts
interface LocalStateVariant {
  id: string;
  locationId: string;
  enableRefs: string[];
  disableRefs: string[];
  actorScheduleOverrides: ActorScheduleOverride[];
  serviceOverrides: ServiceOverride[];
  ambienceProfile?: string;
}
```

No quest should directly rewrite terrain or hydrology. A local state may swap a barricade, occupants, banners, clutter, audio or particles.

## 61. Main-quest branching implementation

The shared spine should use optional hidden objectives:

- copy versus surrender evidence;
- report honestly versus falsify;
- save cult/state/neutral witnesses;
- destroy versus preserve apparatus;
- publish versus conceal;
- secure custody of the Eye;
- maintain cover.

The runtime calculates ending availability from accumulated state. The sanctuary scene displays only choices the player has actually enabled.

Allegiance-track tier-4 locks (30 §24b) gate **track rewards and endgame
backers only, never sanctuary-ending availability**: no ending family may be
conditioned on a `trackLockedAtTierFour` state (validated in §63).

## 62. Faction-system implementation

Faction quests are finite authored lines. Reusable generic systems may support:

- contract boards for flavour/optional repeatable work;
- theft/bounty consequences;
- reputation;
- rank;
- sponsor approval;
- expulsion and reinstatement.

Repeatable tasks never replace core authored progression.

## 63. Validators

Required automated checks. Each carries a rule strength (README's vocabulary):
**hard-rule checks fail the build; strong-default checks fail unless the brief
records a one-line departure reason; targets are report-only.** Unmarked
checks below are hard. Checks that need judgement rather than static analysis
are listed separately in §63b.

### Graph integrity

- every stage reachable under at least one valid state;
- no stage with no successor unless ending;
- no circular objective dependency without an explicit repeat loop;
- every ending reachable in automated simulation;
- mutually exclusive endings cannot both commit.

### World references

- every location, portal, water body, NPC socket, scene mark and container exists;
- required local state variants exist;
- all required asset IDs resolve;
- streaming bundle contains required dependencies;
- no quest references an unapproved temporary test location.

### Player freedom

- all main quests remain completable by every playable race;
- Argonian water breathing creates advantages, not exclusive mandatory progression;
- critical quests have social/stealth/traversal alternatives where designed;
- every quest whose approaches all require BOAT/CLIMB declares a degraded non-traversal fallback approach (hard rule); swimming is universal core traversal — swim-required content instead declares breath-manageable design or purchasable consumables ([00-overview.md](00-overview.md) criterion 25);
- quest cost tiers (S/M/L) are declared; the province-wide S/M/L ratio stays within ±10 points of the 40/45/15 target (strong default) — per-region ratios are reported as information, not gated;
- early main-quest requirements do not force untelegraphed D4/D5 travel;
- faction senior incompatibilities are warned before commitment.

### Fixed difficulty and loot

- no enemy template or loot table references player level;
- fixed rewards resolve;
- **allegiance tracks** (30 §24b): every track reward is gated on a named quest or standing threshold and never on player level; tier 4–5 grants across the four tracks are mutually exclusive and each is telegraphed before commitment; every build genre (heavy, light/stealth, speech, magic, exploration) is served by ≥2 tracks; tier-4 locks gate track rewards and endgame backers only — no ending is conditioned on a lock (§61); the stronghold resolves to one site with three phase states and four allegiance re-skins;
- quest route does not silently lower danger based on player stats;
- capability conditions open alternatives rather than rescale the world.

### Writing quality

- no objective chain consists solely of repeated retrieval;
- every substantial quest includes at least two required design dimensions from Section 4;
- every quest declares a reversal **or a declared memorable element** (the boredom test, [00-overview.md](00-overview.md) §4); a reversal is mandatory at M/L, and every S-tier quest declares a quest-giver with a stated want and vivid trait;
- no run of three consecutive quests in a line shares the same dramatic centrepiece tag;
- **quest novelty** ([55-quest-index.md](55-quest-index.md)): every quest declares one primary and ≤2 secondary shape tags and has a row in the index (hard); the collision rules and shape budgets are checked as 55 states them — 55 is canonical for the numbers and their strengths (the budgets are strong defaults);
- every twist lists its seed-stage IDs (`twists[].seedStageIds`, §58) and each resolves to a real stage; whether the seeding lands is §63b work;
- **lore onboarding** (60 §45d, glossary per §59b): every glossary proper noun resolves to a newcomer-phrased dialogue topic, core terms are flagged Act-I-available, and `opaque` entries are exempt; no quest brief's stakes depend on out-of-game lore;
- project-original lore carries source-confidence and author notes.

### Cast integrity ([35-cast.md](35-cast.md) §60)

- every named NPC record declares a depth tier C1–C4;
- every major line declares 3–5 desks with fixed posts across ≥2 settlements (compact lines ≥3 desks or a declared canon-itinerant exception), a named between-desk argument, a mid-line pick-a-desk stage, and a finale stage resolving the argument;
- every desk in a line declares a distinct ethic and register (whether they survive a blind read is §63b work);
- ≤⅓ of any cast list uses the Verb-the-Noun translated name form, and no core image (reed/root/water/stone/shadow) repeats within a list (strong defaults — warn, gate only without a recorded reason);
- non-Argonian names conform to their province's conventions;
- every C2 declares a fixed post; no **C2** appears in another line's quest table — the C1 protected registry ([36-cast-roster.md](36-cast-roster.md) §55) is the declared exception list for deliberate cross-links; ≥1 desk per line can die, leave or turn;
- every region packet cites cross-line texture from a shared place, a declared collision or a shadow network (never an imported cast member) and contains ≥1 oddity;
- every C1/C2 has a successor or documentary fail-forward path and a voice sheet before dialogue authoring;
- ≤1 flagged cliché per line, 0 in C1, each declaring its subversion;
- cast-wide: ≥3 characters flagged `correct-but-hard`, ≥3 flagged `wrong-but-honourable` (strong defaults), 0 flagged wrong about everything;
- C4 records carry no authored history and no main-quest opinions.

### Deliverability

- every quest declares a delivery tier D-A/D-B/D-C;
- D-C quests are ≤10% of the total, ≤1 per faction line, and each names an engineering owner and a D-B fallback authored alongside it;
- **no quest brief contains a free-roaming fleeing NPC, an escort through hostile space, protect-the-NPC combat, vessel-versus-vessel pursuit, or more than six simultaneously active actors** (hard rule) — the validator **gates on structured fields only**: centrepiece tags, the declared max simultaneous actor count, and movement declarations, and fails the brief until it is converted (§4 conversion table). Free-text vocabulary matching ("chase", "escort", "crowd"…) is a **warning lint**, never a gate — aftermath quests legitimately use those words;
- every follower or guide movement is declared as waypoint-leash or teleport-to-mark, never free navmesh pursuit, and is invulnerable in transit;
- every scene survives an actor failing to reach a mark;
- named-NPC casualties are authored at fixed points, never emergent from allied combat AI.

### Tier protection (hard rule — canonical text in [40-factions.md](40-factions.md) §30b)

- every brief carries a `touches` list (§58) of the shared ids it reads or writes;
- fail any **write** to an id owned by a higher tier (tier 2 → tiers 1/0; tier 1 → tier 0);
- fail any removal or consumption of a topic or evidence id flagged `essential` in data by a higher tier. Essential-marking is a **data flag**: everything unmarked is fair game;
- runtime behaviour: all NPCs are player-killable. Killing one flagged essential to tier 0/1 shows the doom-warning message (text in [30-main-quest.md](30-main-quest.md) §23) — never a silent break.

### Fail-forward

- critical NPC deaths have successor/documentary path;
- lost quest items have recovery or state transfer;
- faction expulsion has explicit consequences;
- hostile city state does not make unrelated questlines permanently impossible without intentional design.

## 63b. LLM-critic review checks

Not validators: these need judgement, and pretending a regex can do them
produces false confidence. A critic agent (the §65 step-5 narrative critic)
reviews each brief/packet for:

- **twist quality** — the declared seed stages genuinely seed the twist, and it is reinterpretive and actionable, not a trivia reveal;
- **blind-read desk distinctness** — no two desks in a line are interchangeable from their quest lists alone;
- **no unchosen biography** — dialogue never asserts a player past the player did not choose.

## 64. World Studio narrative tools

After narrative implementation begins, World Studio should support:

- searchable quest/faction list;
- quest graph view;
- current/available stage display;
- set/rollback stage in debug saves;
- variable and evidence inspector;
- teleport to stage location/approach;
- spawn required NPC or item in debug mode;
- apply local state variants and show diff;
- simulate faction rank/incompatibility;
- run ending-availability report;
- show danger/capability mismatch;
- export structured play trace.

Agents should read traces and validator output by default. The owner judges prose, pacing, visuals and lived play.

## 65. Agent-authored content workflow

1. Read only the relevant regional, faction, lore and asset docs.
2. **Run the novelty check** ([55-quest-index.md](55-quest-index.md) §47c): declare the proposed shape tags, scan the index for collisions in the same region/line/reversal/resolution, and differentiate, merge or drop before writing anything.
3. Inspect the final world IDs and causal location records.
4. Draft a quest brief with premise, characters, methods, choice, aftermath and world-provision links — and **add its row to the quest index in the same change**.
5. Run a narrative critic before implementation.
6. Encode typed blueprint and dialogue.
7. Run static validators.
8. Run headless/state simulations for all branches.
9. Play the quest in World Studio with telemetry.
10. Owner reviews prose, experience and visuals.
11. Revise rather than append duplicative documentation.

Runtime LLM improvisation is not part of the shipped game.

