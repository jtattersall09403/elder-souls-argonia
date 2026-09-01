# Lore layers, dialogue, twists and rewards

> Module of the quest/narrative master plan (see [README](README.md)).

# Part X — Lore, dialogue and writing strategy

## 45. Canon, inference and project-original material

Every narrative datum should use the existing source-confidence categories:

| Layer | Treatment |
|---|---|
| **Canon/game-derived** | Preserve direct facts; surface conflicts between official sources rather than silently flattening them. |
| **Lore-inferred** | Use logical inference where Fourth-Era Black Marsh is under-described; record reasoning and era range. |
| **Project-original** | New offices, people, events and mechanisms must fill a real gap, respect known history and avoid pretending to be canon. |
| **Community inspiration** | Credit named fan contributors/projects and identify what was adapted. |

The Veiled Reed, Unbound Root and Root of Accord are project-original. The Eye of Argonia, Hist, Sithis, Nisswo, An-Xileel, Shadowscales, Duskfall, Xanmeers, Lilmoth/Umbriel and Black Marsh cities are grounded in established lore.

## 45b. Argonian register

Canon Argonian speech habits bind dialogue authoring; the full set lives in the
lore dossier — read it before writing Argonian dialogue rather than
rediscovering it per quest (lore: topics/material-culture.md § *Language notes
for dialogue*). Headlines: Jel has no past or future tense; body language
carries grammar, which is why Argonians speaking Tamrielic preface statements
with emotional qualifiers ("I erect the spine of…", "My rage-quill is
engorged!"); farewell "Stay moist.", curse "Hist piss!", exclamation "Host of
Stormhold."; outsiders are **ojel** (not derogatory) — the An-Xileel's
**Lukiul** very much is. Moderation: one qualifier per scene per speaker is
plenty; overuse is the failure mode.

## 45c. The 4E 48 calibration (binding tone rule)

The owner's directive: the generational trauma of Umbriel plays at the
emotional distance our own 2026 has from the First World War (lore:
extrapolation/argonia-4e201-state.md §9). For every quest touching Umbriel, the
An-Xileel, the Lukiul question or the southern cities:

- **No living witnesses.** Argonian lifespans are human-like; anyone claiming
  to remember Umbriel is lying, mistaken, or not what they seem.
- **An NPC may be bored by it.** 153 years makes it history — argued about,
  politicised, taught badly, exploited, shrugged at by the young. Playing it
  that way is what makes the places where it *is* still raw land properly.
- **It is not universal.** Thornmarsh and Archon were barely touched; Murkmire,
  Lilmoth, Gideon and Stormhold carry it. Do not assume a province-wide wound.
- **The Nisswo counter-argument is sympathetic.** A Nisswo telling a grieving
  community to let go is preaching *shunatei*, not being callous;
  memorial-versus-letting-go must be argued honestly on both sides.

Province-wide register: **melancholy and dignified, horror kept local** (owner
decision Q5).

## 45d. The player knows nothing (binding onboarding rule)

Owner directive 2026-08-26: **assume the player has no Elder Scrolls lore
beyond, at most, having played Morrowind** — and none of Argonia's. The player
character is an outsider (Morrowind's model), so ignorance is diegetic and
asking basic questions is in character.

- **Every load-bearing proper noun has a dialogue topic** (Hist, sap, Nisswo,
  Sithis, An-Xileel, Lukiul, the Owing, Shadowscales, Xanmeer, the Eye, the
  Scalded Throne…), phrased for a newcomer, discoverable from ordinary NPCs —
  the Morrowind topic system used as a teaching instrument. The obligation is
  scoped by the **glossary** (defined in 80 §59b): only load-bearing/
  stakes-bearing nouns need topics, not every lore word. Entries flagged
  `opaque` are the carve-out — deliberate wonder content whose topic returns
  folk speculation, never truth, and which is exempt from newcomer coverage.
- **Act I is the lore onboarding**: by the end of MQ05 the player has had a
  natural opportunity (never a lecture) to learn what a Hist is and how the
  cult's harvest kills a clutch — its Mnemic-Egg interference severs the
  egg-connection, and the eggs die with it; the tree's silence is the *sign*,
  the severed connection the *cause* (`CANON_DERIVED` — canon ties egg death
  to the connection, not to withdrawal as such) — what the Wardens are, what
  an Owing is, and that the throne is empty. Each is taught by a *scene*, not
  a codex: the dead clutch, the ledger read-out, the empty hall.
- **No quest may require outside-game knowledge** to understand its stakes or
  its choice. If a brief's premise needs a lore fact, the quest itself must
  surface that fact en route.
- Explanations use plain speech in character; NPCs may disagree about the
  facts, but a newcomer must be able to assemble the working truth — enough to
  weigh the main choice, not doctrinal resolution.
- Validator: glossary terms carry topic coverage and an Act-I availability
  flag; `opaque` entries are exempt (80 §59b, §63).

## 45e. TES voice, and the AI-voice failure mode (binding, owner 2026-09-01)

Owner directive, decision
[0042 §6](../decisions/0042-buildout-steers-and-engineering-standards.md).
**Model-written prose reaches for gravitas and produces constructions nobody
writes.** The owner's example, from a death message: *"With this death, a root
the story grew along is severed"* — a stranded preposition wrapped round a
relative clause, reaching for weight. Grammatical would be *"a root along which
the story grew"*; **good** is *"With this death, a root is severed."*

**TES prose is plainer than people remember.** Short declaratives. Concrete
nouns. Archaism carried by *vocabulary and idiom* — not by inverted or twisted
syntax. When a line feels portentous, cut it in half; what remains is usually
the line.

Three stages, and this is a *requirement on writing*, not a cleanup afterwards:

1. **A voice research pass** derives the rulebook from the actual corpus
   (Morrowind dialogue and books, Skyrim's better-written material): register,
   sentence length, permitted archaism, how each culture and class speaks, and
   — the place AI voice hides best — **how system messages sound** (deaths,
   tutorials, item descriptions, failure text, where no character anchors the
   register).
2. **The rulebook binds every text-producing agent** as an input to writing.
3. **An independent voice-review agent** — a different agent from the writer,
   by design, because a writer will not catch its own register — reviews
   written text against the rulebook and proposes the specific edit.

Engineering standard 4 (one keyed text catalogue,
[../engineering-standards.md](../engineering-standards.md)) is what makes stage
3 mechanical: the reviewer sweeps one catalogue instead of hunting through code.

### 45e.1 Banned constructions (grows — add on sight)

| Don't | Do | Why |
|---|---|---|
| "a root the story grew along is severed" | "a root is severed" | stranded preposition reaching for weight; cut to the image |
| "With this act, the very fabric of…" | name the actual thing | "the very" is always padding |
| "You feel a sense of unease wash over you." | "You are uneasy." / say what is wrong | telling the player their feelings, at length |
| Tricolons in system text ("the lost, the drowned, the forgotten") | one noun | the single loudest AI tell |
| "Perhaps… perhaps not." / trailing ellipses for mood | end the sentence | |
| "It is said that…" as an opener | say it, or attribute it to someone | |

## 46. Dialogue model

Most dialogue should use Morrowind-like text and topics:

- NPC-specific introductions;
- topic knowledge unlocked through conversation, evidence and faction rank;
- long-form testimony where the speaker has reason to provide it;
- short ordinary exchanges for daily life;
- regional rumours responsive to local state;
- documents, laws, contracts, letters, songs and oral histories;
- player responses that express position without inventing biography;
- race-sensitive reactions that never assume birthplace or guilt;
- generic voiced greetings/combat barks where suitable audio exists.

Avoid:

- every NPC delivering an encyclopaedia;
- identical exposition in several mouths;
- modern bureaucratic prose for all institutions;
- one developer-approved lore narrator;
- choices labelled as obviously good/evil;
- plot twists dependent on characters withholding facts for no reason.

## 46b. Voice — how a character is told apart in text

There is no full voice acting, so **the prose is the performance**. Who a
character *is* lives in [35-cast.md](35-cast.md); this is how they sound.

Every C1 and C2 gets a one-page voice sheet before any dialogue is written,
carrying exactly five things:

1. **Sentence length and rhythm.** The cast's registers must not converge:
   Sings-Over-Stone corrects in clauses; Never-Writes-Twice speaks in finished
   sentences she could defend under oath; Spills-The-Ink starts twice; Ei-Tuja
   answers a different question than the one asked and it turns out to be better.
2. **Their Jel register habit** (§45b). *Which* emotional qualifier a character
   reaches for is characterisation: an office-hardened Argonian may have dropped
   them entirely when speaking to *ojel*, and that loss is worth a line
   somewhere. A **lukiul** cannot use them naturally and it shows.
3. **What they will not say.** Every character has one subject they change
   direction around, and the player can notice it long before they find out why.
4. **How they address the player** — and whether it changes across the game. This
   is where trust, rank and the branch state become audible without a meter.
5. **One repeatable formula** the player will recognise on sight after three
   meetings. Cheap, and it is most of what memorability actually is.

Additional rules:

- **No two characters in a scene share a register** (strong default — a
  deliberate shared register can be the joke; record the one-line reason). A
  scene with three grave people in it by accident is one character having an
  argument with itself.
- **A character's name form constrains their voice** (35-cast §54): a Jel-named
  interior elder and a translated-name city clerk should not be
  interchangeable in a blind read.
- **Comic characters carry real information.** Ei-Tuja and Sings-Over-Stone are
  funny *and* are the two people who tell the player what the Eye and the cult
  actually are. Humour is not a decoration on the texture tier.
- **C4 texture NPCs get one line of specificity and no worldview** (35-cast §59).

## 47. Staged scenes

Use staged scenes sparingly — for example:

- opening attack;
- first Helstrom arrival;
- key auction/heist moments;
- council;
- cult sermon;
- sap-dream/vision sequences (fog-dressed reuse of existing interiors; see the wonder budget in Section 4);
- Last Warden entrance;
- sanctuary confrontation;
- epilogue meetings.

Scenes should:

- use 2–6 active speakers where possible;
- remain fully comprehensible in text;
- survive an actor failing to reach a mark;
- permit player movement or a clean skip/recovery;
- avoid bespoke facial capture or one-off animation;
- use existing locomotion, gesture, combat and interaction animations.

## 48. Twist discipline

Every major twist must be:

1. seeded earlier;
2. reinterpretive;
3. actionable;
4. caused or suffered by a character/institution;
5. compatible with all player races;
6. implementable without a new art set or world simulation.

Principal main-quest revelations:

- the cult has a coherent grievance rather than generic madness — but it is met
  first as what it also truly is: a movement that kills trees, and with them
  eggs and the dead's way home;
- the woman from the opening attack and the voice in the dreams are the same
  person, and she is the end of the road;
- the Veiled Reed allowed or manipulated some evidence to identify the network;
- the cult leader once served the Veiled Reed — and designed the apparatus she
  now fights;
- the player's own handler falsified records, and the honest officer destroys
  her for it;
- the Root is a voluntary historical accord converted into compulsory authority;
- the Eye grants access/understanding, not automatic sovereignty — **but the
  throne is empty, and late in the game the player realises the claim is
  genuinely available to them**;
- both state custody and full severance impose choices on communities;
- the mend-and-walk-away ending exists only if the player has done difficult
  evidential and coalition work.

## 49. Fixed difficulty and quest guidance

Quests never inspect player level to substitute easier enemies or better loot.

They may inspect capabilities and knowledge to offer routes:

- water breathing;
- swim competence;
- climbing;
- lock skill;
- stealth;
- **speechcraft and standing** — the persuasion score (Speechcraft + Personality
  + evidence + standing) crossing an authored threshold, never a roll and never
  skill alone (world [76 §125](../world/76-stats-progression.md); added
  2026-08-29 — speech is an ending-grade system here, so it belongs on this
  list);
- faction standing;
- spells;
- boat ownership;
- disease resistance;
- known fast-travel nodes.

Warnings are diegetic. A D4/D5 quest giver should describe route deaths, required supplies and available guides. The player can enter danger early and fail naturally.

## 50. Rewards

Rewards should be fixed and causal:

- faction equipment issued at rank;
- unique items belonging to named characters or sites;
- training, safe houses, ferry rights, rootworm access and legal permissions;
- fixed gold/valuable goods appropriate to employer;
- documents and knowledge;
- local service changes;
- reputation and sponsorship.

No reward quality scales to player level.

**The reward genres, and where the ladders live.** The genres proven by the
three reference games — signature gear at a named rank; a drip of unique
enchanted items roughly one per quest; economic access (fences, trainers, free
guild property, bounty relief); disposition and price effects; a capability
unlock; a salary with a strategy attached; a base built in phases; consumables
with a unique rule; a permanent change with real trade-offs; new abilities;
prestige gear and a title at the finale; and recognition that changes how the
world treats you — are catalogued with evidence in
[../research/tes-quest-and-faction-rewards.md](../research/tes-quest-and-faction-rewards.md).

Two structural rules taken from that research:

- **Rewards teach the fantasy.** A line's rewards must match its playstyle, the
  way thieves get fences and a cowl while mages get a crafting system. A faction
  whose rewards could belong to any other faction has been designed lazily.
- **One reward per quest is affordable** *if* items are re-materialled variants
  with distinct enchantments rather than bespoke models — which is exactly our
  no-new-art constraint. Oblivion's Dark Brotherhood is the model.

The main quest's four allegiance reward tracks — their DNA, five tiers each,
the stack-low/lock-high rule and the single phased stronghold — are specified in
[30-main-quest.md](30-main-quest.md) §24b.

