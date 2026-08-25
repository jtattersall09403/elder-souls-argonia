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

Required automated checks:

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
- every quest whose approaches all require WATER/BOAT/CLIMB declares a degraded non-traversal fallback approach;
- quest cost tiers (S/M/L) are declared and regional S/M/L ratios stay near the 40/45/15 target;
- early main-quest requirements do not force untelegraphed D4/D5 travel;
- faction senior incompatibilities are warned before commitment.

### Fixed difficulty and loot

- no enemy template or loot table references player level;
- fixed rewards resolve;
- quest route does not silently lower danger based on player stats;
- capability conditions open alternatives rather than rescale the world.

### Writing quality

- no objective chain consists solely of repeated retrieval;
- every substantial quest includes at least two required design dimensions from Section 4;
- every quest declares a reversal (the boredom test, [00-overview.md](00-overview.md) §4) and every S-tier quest declares a quest-giver with a stated want and vivid trait;
- no run of three consecutive quests in a line shares the same dramatic centrepiece tag;
- every twist is seeded and actionable;
- dialogue does not assert an unchosen player biography;
- project-original lore carries source-confidence and author notes.

### Cast integrity ([35-cast.md](35-cast.md) §60)

- every named NPC record declares a depth tier C1–C4;
- no two characters in a faction line share a relationship type *and* an institutional role *and* a register;
- ≥4 distinct relationship types among the recurring cast of each major line, ≥3 for compact lines;
- ≤⅓ of any cast list uses the Verb-the-Noun translated name form, and no core image (reed/root/water/stone/shadow) repeats within a list;
- non-Argonian names conform to their province's conventions;
- each major line declares ≥3 recurring characters appearing in ≥3 of its quests, and ≥1 who can die, leave or turn;
- every region packet reuses ≥2 recurring characters from elsewhere and contains ≥1 oddity;
- every C1/C2 has a successor or documentary fail-forward path and a voice sheet before dialogue authoring;
- ≤1 flagged cliché per line, 0 in C1, each declaring its subversion;
- cast-wide: ≥3 characters flagged `correct-but-hard`, ≥3 flagged `wrong-but-honourable`, 0 flagged wrong about everything;
- C4 records carry no authored history and no main-quest opinions.

### Deliverability

- every quest declares a delivery tier D-A/D-B/D-C;
- D-C quests are ≤10% of the total, ≤1 per faction line, and each names an engineering owner and a D-B fallback authored alongside it;
- **no quest brief contains a free-roaming fleeing NPC, an escort through hostile space, protect-the-NPC combat, vessel-versus-vessel pursuit, or more than six simultaneously active actors** — the validator matches on the brief's centrepiece tags and provision text and fails the brief until it is converted (§4 conversion table);
- every follower or guide movement is declared as waypoint-leash or teleport-to-mark, never free navmesh pursuit, and is invulnerable in transit;
- every scene survives an actor failing to reach a mark;
- named-NPC casualties are authored at fixed points, never emergent from allied combat AI.

### Fail-forward

- critical NPC deaths have successor/documentary path;
- lost quest items have recovery or state transfer;
- faction expulsion has explicit consequences;
- hostile city state does not make unrelated questlines permanently impossible without intentional design.

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
2. Inspect the final world IDs and causal location records.
3. Draft a quest brief with premise, characters, methods, choice, aftermath and world-provision links.
4. Run a narrative critic before implementation.
5. Encode typed blueprint and dialogue.
6. Run static validators.
7. Run headless/state simulations for all branches.
8. Play the quest in World Studio with telemetry.
9. Owner reviews prose, experience and visuals.
10. Revise rather than append duplicative documentation.

Runtime LLM improvisation is not part of the shipped game.

