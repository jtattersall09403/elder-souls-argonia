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

## 45b. Argonian register — and the layered model it sits in

**This section binds Argonian speakers only.** Argonia holds all ten Tamrielic
races in the proportions in [world/92 §82](../world/92-demographics.md), and a
Khajiit, a Dunmer or a Nord living in the marsh does **not** speak like a
Saxhleel. Every speaker's voice is composed from four layers — race +
upbringing + region + faction — per
[text/culture-registers.md](../text/culture-registers.md) §0, which is the
binding model; this section is just its Argonian race row in full.

Canon Argonian speech habits: the full set lives in the lore dossier — read it
before writing Argonian dialogue rather than rediscovering it per quest (lore:
topics/material-culture.md § *Language notes for dialogue*). Headlines: Jel has
no past or future tense; body language carries grammar, which is why Argonians
speaking Tamrielic preface statements with emotional qualifiers ("I erect the
spine of…", "My rage-quill is engorged!"); farewell "Stay moist.", curse "Hist
piss!", exclamation "Host of Stormhold."; outsiders are **ojel** (not
derogatory) — the An-Xileel's **Lukiul** very much is. Moderation: one
qualifier per scene per speaker is plenty; overuse is the failure mode. A
**lukiul** cannot use them naturally and it shows.

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

**All three stages below are now built** (decision
[0043](../decisions/0043-text-quality-workstream.md), 2026-09-03): the research
pass is done, the rulebook is [docs/text/](../text/README.md), and the reviewer's
brief is [docs/text/review-process.md](../text/review-process.md). Writers read
that shelf; **this section keeps the banned-constructions table below**, which is
the single place new rows are added.

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

Evidence, examples and the reviewer's qualitative tests:
[docs/research/ai-writing-tells.md](../research/ai-writing-tells.md). **Density is the
tell, not any single instance** — these are checks, not a lint.

| Don't | Do | Why |
|---|---|---|
| "a root the story grew along is severed" | "a root is severed" | stranded preposition reaching for weight; cut to the image |
| "With this act, the very fabric of…" | name the actual thing | "the very" is always padding |
| "You feel a sense of unease wash over you." | "You are uneasy." / say what is wrong | telling the player their feelings, at length |
| Tricolons in system text ("the lost, the drowned, the forgotten") | one noun | the single loudest AI tell |
| "Perhaps… perhaps not." / trailing ellipses for mood | end the sentence | |
| "It is said that…" as an opener | say it, or attribute it to someone | |
| "…, which is the point / the problem / the whole story" as a sentence-final gloss | cut the clause; the fact already said it | the writer explaining its own image (Phase 11 catalogue review 2026-09-03: dozens per region) |
| `faintly / quietly / slightly / genuinely` + adjective as a mood formula | one plain adjective, or what happens | the hedge is the model reaching for nuance; at scale every place gets the same beat (46 in one region) |
| Adjective or abstract-noun tricolons in label fields ("callous, efficient, deeply resented"; "Contested reverence") | two beats, or one concrete fact | the tricolon rule applies to fragments; the third term is the reader's reaction |
| Design or pipeline voice inside world prose ("the reveal IS the beat", "per the two-culture kit rule", "the province's default dungeon", "band 5", "POI", "Owner decision Q2") | describe the place; put the decision in a decision record or a typed field | authorial rationale is not fiction |
| Game/session references in in-world prose ("where the game starts", "the first quiet the player gets") | describe the place, not the playthrough | |
| Sentence restated with an appended clause ("The seal leaks. The seal leaks, and the Waykeepers…") | write the long sentence once | a Phase 11 writer artefact, ~400 instances province-wide |
| Two stock phrases welded with an em dash ("worn but sound — everything load-bearing is new") | one clause | the dash doing the work a choice should do; often contradictory |
| Modern idiom no one in the world could hold ("unionised", "brute-forced", "ordinary until it isn't", "infrastructure", "leverage") | the plain word for the thing | |
| "X — the only such thing in the province" flourish after a concrete image | end at the image; uniqueness goes in a fact field | |
| Provenance markers inside world prose ("Canon:", "Canon-named as", "canon says") | state the fact; the citation goes in `sources` | design sourcing voice in fiction (second review pass 2026-09-04) |
| A label field (`mood`, `condition`) restating the field above it, or a `hook` copying `siteAdvantages` | cut the echo; the hook says what the player gets | a writer artefact, four to eleven per region |
| "everyone knows X and nobody does Y" as a closer | end at "everyone knows" | the owner's named tell |
| The same label-field SHAPE across a whole set ("adjective pair, and appended judgement" in 77 of 134 moods) | vary the shape between records | convergence is a set property; fix the set, not the line |
| Game or session references in `note` fields ("the game's first loss", "before the game does") | describe the thing | the in-world-prose row was being dodged via notes |
| Contrast joined with *and* where the sense is *but* ("The bridge is new and no one uses it") | use **but** — it is allowed and usually better — or cut the second clause | the model avoids *but* (owner finding 2026-09-04); see the and/but test in [research/ai-writing-tells.md](../research/ai-writing-tells.md) §5 |
| Sentence-final antithesis pair ("…the one thing everyone knows and nobody will talk about") | end at the first half | a balanced closer bolted to a finished sentence; the most distinctive AI beat in the Phase 11 catalogue |
| Negative parallelism ("it is not a shrine, it is a warning"; "not just a ford but a boundary") | say the true half only | ~3× more frequent in post-2022 web text (Pew); reads as machine contrast |
| Colon-reveal ("The garrison has one purpose: fear") | write it as a sentence | the colon doing a drum-roll |
| Question answered in the next clause ("Who guards it? No one.") | state it | rhetorical scaffolding, not speech |
| Register vocabulary: *delve, tapestry, testament, realm, intricate, interplay, underscore, pivotal, showcase, meticulous, landscape, foster, harness, navigate* | the plain word for the thing | the standard AI-vocabulary list; *tapestry* and *testament* are the loudest |
| Scene-setting defaults: *nestled, whispers, echoes, timeless, ancient* | one concrete noun ("a village on the sandbar") | unchecked, these open half the descriptions |
| Grandeur without specifics ("the fort's enduring presence") | a number, a name or an object | vagueness is a stronger tell than vocabulary |
| Every paragraph ending on a resonant line | most records end on a plain fact | uniform flourish is a set-level failure; caught by the flourish count (review-process §3) |
| One-sentence paragraph dropped for punch | fold it into the paragraph above | |
| Uniform sentence length through a paragraph | let one sentence be four words | human rhythm is uneven. Flat sentences carry the interesting ones |
| Constructions with a comma followed by 'and' | Avoid. Phrase differently. | British English convention. e.g. don't write constructions like e.g. "this name is important, and nobody will tell you why", or "the answer is wrong, and it changes the picture in an interesting way" |
| "has never once …", "not once …" | "has not …" or state what did happen | the emphatic negative absolute; a tell in its own right (owner 2026-09-04) |
| "the one thing / the one place / the one stretch of road that …" | name the thing plainly; put uniqueness in a fact field if it matters | uniqueness flourish; 20 in one pass of the catalogue |
| "the only …" more than once in a record, or as a closer | say what it is; keep *the only* for a plain fact ("the only smith south of the lake") | overused to manufacture importance; density is the tell — the linter counts it per 1,000 words |
| "nobody ever …", "no one will say / explain …", "will not explain it", "has not been discussed" as a beat | a fact, or a person who does say | the withheld-secret beat; fine once, a tic at scale |
| **The flat and-pair**: a clause, *and*, then a second clause that turns the first into a wry shrug ("Trial-keepers set the route each year and will not explain it"; "The trial kills someone every few years and the tribes have decided that is correct") | split into two sentences, or drop the second clause, or make the second clause a plain fact that does not comment on the first | the second clause is the writer's *judgement* delivered deadpan; one per region is wit, one per record is a voice (owner 2026-09-04; style guide §2.6 has the diagnosis) |

**Mechanical floor (2026-09-04):** `python3 -m worldgen.lint_prose` (from
`tooling/world-generation`) catches every phrase-level row above it can express
as a pattern — comma-and, never-once, the-one-thing, nobody-ever, the-very,
it-is-said, self-gloss, negative parallelism, register vocabulary, ellipses,
provenance voice, hedged-adverb formulas — and counts the density of *the
only*, *never*, the flat and-pair and the withheld-secret beat. It runs over
the place catalogue in `npm test` (`--strict`) and over any markdown you pass
with `--md`. It is a floor, not the review: the shape tests in
[docs/text/review-process.md](../text/review-process.md) §3 still run by eye.

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
carrying exactly six things:

1. **Their four layers, named explicitly** — **race**, **upbringing**,
   **region** and **faction** ([text/culture-registers.md](../text/culture-registers.md)
   §0). All four fields are mandatory, even when one is "none" (no faction) or
   "default for their race". A sheet missing a layer produces a character who
   defaults to the province's majority voice, which is the exact failure the
   layered model exists to prevent. Note here any deliberate departure from a
   layer, and why — the voice sheet outranks the layers, but only on the record.
2. **Sentence length and rhythm.** The cast's registers must not converge:
   Sings-Over-Stone corrects in clauses; Never-Writes-Twice speaks in finished
   sentences she could defend under oath; Spills-The-Ink starts twice; Ei-Tuja
   answers a different question than the one asked and it turns out to be better.
3. **Their one race marker, and how strong it is** (culture-registers §1).
   For an Argonian that is the Jel qualifier (§45b) and *which* one they reach
   for is characterisation — an office-hardened Argonian may have dropped them
   entirely when speaking to *ojel*, and that loss is worth a line somewhere.
   For a Khajiit it is how completely duty suppresses the illeism; for a Dunmer,
   which rung of *sera / muthsera / serjo* they use for whom.
4. **What they will not say.** Every character has one subject they change
   direction around, and the player can notice it long before they find out why.
5. **How they address the player** — and whether it changes across the game. This
   is where trust, rank and the branch state become audible without a meter.
6. **One repeatable formula** the player will recognise on sight after three
   meetings. Cheap, and it is most of what memorability actually is.

Additional rules:

- **No two characters in a scene share a register** — and where two characters
  *do* share a race, they must differ on at least one other layer (strong default — a
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

