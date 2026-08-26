# Quest system — overview, targets and design rules

> Module of the quest/narrative master plan (see [README](README.md)).
> Read this first for the story, content targets, frozen decisions and
> design rules; acceptance criteria at the end.

# Elder Souls: Argonia — Quests, Factions and Lore Strategy

**Main quest: _The Eye and the Root_**  
**Setting:** Black Marsh, early/concurrent **4E 201**  
**Canonical repository:** `jtattersall09403/elder-souls-argonia`  
**Production status:** narrative/world-provision plan; quest runtime and production content begin after the province-scale world build is substantially complete

---

## Executive summary

The game’s main story now uses a largely static province in the same production-efficient way that *Morrowind* used Vvardenfell: the geography, cities, roads, ruins, Hist groves and dangerous interior exist independently; quests reveal their meaning and place people, evidence, enemies and choices upon them. The narrative does **not** require rivers to change course, province-wide flood simulation, strategic armies, dynamically rebuilt settlements or substantially different world geometry for every ending.

The player begins as an unnamed prisoner on a penal work detail travelling through the managed marsh near Stormhold and Alten Corimont. An attack by a radical Sithis movement destroys the work party and leaves the player officially recorded as dead. The **Veiled Reed**, a project-original intelligence office of the An-Xileel successor state (lore: extrapolation/argonia-4e201-state.md §1), recruits the player as a deniable agent: a person with no established local allegiance, no surviving official identity and direct knowledge of the attack.

The investigation concerns several Hist communities that have suffered deliberate acts of ritual interference. The movement responsible—the **Unbound Root**—argues that the Hist–Argonian relationship has been converted into a political instrument by the An-Xileel. Its members seek the legendary **Eye of Argonia**, an established but scarcely described king’s jewel said to be the key to a Lost City. The Eye is treated as a gem, cipher and perceptive key, following the official fragment and several credited fan interpretations.

The player follows a province-wide treasure hunt through prison ruins, drowned archives, auctions, mixed cities, underwater Xanmeers and disputed histories — and the hunt is a race: a courteous rival collector shadows the same leads, a second Hist withdraws mid-hunt, and the cult's method is being tested while the player reads maps. Helstrom is introduced during the first act by escorted boat convoy up the guarded marsh channels. The city itself is safe and becomes a recurring political and religious hub, while its surrounding dark basin remains D5 endgame country from the start. Players may walk out of the gates early; the world does not scale down for them.

After recovering the Eye, the Veiled Reed orders the player to infiltrate the Unbound Root. The player may remain loyal, become a genuine double agent for the cult, pursue an independent course, or work toward a difficult reform outcome. Most of the questline shares the same locations and stages. Branching is implemented through hidden objectives, evidence, trust, cover integrity and a small number of late scene variations.

The climax is an expedition from Helstrom through the highest-danger marshes to a fixed Lost City dungeon. The Eye reveals its route and opens the sanctuary. The player completes the dungeon, faces an ancient Wamasu guardian, and then uses the Eye either to preserve the Root of Accord, place it under a different authority, conceal it, selectively remove its coercive machinery, or complete the cult’s Unbinding.

The principal stakes are the future relationship between Argonians and the Hist, the legitimacy and reach of the An-Xileel, and whether liberation from coercive authority justifies severing a living bond that structures communities, eggs, memory and identity. A cult victory creates serious province-wide cultural and spiritual consequences, represented through selected local world states, NPC changes, documents and the epilogue rather than complex dynamic geography.

### Content targets: Milestone 1 core and mature end state

Two targets are defined. **Milestone 1** is the smallest version of the game that is complete, satisfying and honest — a full main quest, four deep factions, and enough regional texture that the province feels inhabited. The **mature target** is the end state after further regional packets. Nothing in Milestone 1 is throwaway; later waves extend rather than replace it.

| Content family | Milestone 1 (shippable core) | Mature target | Typical direct playtime at maturity |
|---|---:|---:|---:|
| Main quest | 32 core quests plus modular epilogue | same | 30–40 hours |
| Deep faction lines (Shadowscales, Night-Reed, Nisswo, Many-Root) | 4 lines, 10–12 substantial quests each | same | 12–18 hours per line |
| Standard faction lines (Marsh Charter, Sunken Archive, Reed-Sail, League) | 4 lines, 6–8 quests each | 8–10 quests each | 8–14 hours per line |
| Compact/regional/secret lines | 2 lines | 4 lines, 4–6 quests each | 4–8 hours per line |
| Regional, city and standalone authored quests | 60–80 | 130–170 | highly variable |
| Mythic/artifact/Daedric-scale quests | 4–6 | 10–14 | 1–3 hours each |
| Unmarked and micro chains | 15–25 | 40–60 | 10–45 minutes each |
| **Finite journaled total** | **approximately 170–210** | **approximately 300–350** | **roughly 110–150 hours for a broad first run at maturity; more across incompatible paths** |

The Milestone 1 core already exceeds Oblivion's base journal count and approaches Skyrim's, while the mature target sits between Skyrim base and Morrowind GOTY. Playtime estimates should be treated as ceilings, not marketing: Morrowind's base main quest is commonly completed in 25–30 hours, and a 32-quest main line at 30–40 hours is already ambitious.

These are end-state targets. The world-generation programme builds the spaces and semantic affordances first. Narrative runtime and authored quest implementation begin later in coherent regional packets.

---

---
# Part I — Frozen decisions and comparative research

## 1. Frozen project decisions

- The game begins in **early/concurrent 4E 201**.
- Skyrim’s Civil War, Dragon Crisis and Last Dragonborn may appear only as distant and contradictory reports; no Skyrim ending is fixed.
- The protagonist is a classic Elder Scrolls blank slate of any playable race.
- Their imprisonment reason, birthplace, family, tribe and prior loyalties are unspecified.
- The opening is a prisoner tutorial in the marsh near Stormhold/Alten Corimont.
- Helstrom is accessible during Act I by protected fast travel (escorted boat convoy; owner decision 2026-08-23); the city is safe, the surrounding basin is permanently high danger.
- External enemies, loot and containers never scale to player level.
- Main-quest required destinations broadly rise from D1/D2 to D3/D4 and finally D5.
- Dialogue is predominantly text-led and Morrowind-like, with limited staged scenes.
- No full voice acting is required; generic greetings, combat barks and acknowledgements may use available audio.
- The main quest uses static geography and finite local states.
- All art must come from vanilla Skyrim/Creation assets and available credited Skyrim mods.
- Quest and faction production follows the world-generation programme.
- Major faction lines are mostly independent of the main quest. Membership may offer alternate methods or recognition, but faction completion is not required for main-quest progress.
- Some senior faction paths are mutually exclusive.
- The player does not automatically become supreme leader of every organisation.
- Serious topics—slavery, colonialism, retaliation, nationalism, cultural assimilation, state surveillance, religious authority and political violence—receive serious, multi-perspective treatment.

## 2. Quantitative benchmark

Elder Scrolls quest totals vary by whether administrative journal entries, mutually exclusive branches, expansions, miscellaneous tasks and repeatable work are counted. The figures below are planning benchmarks.

| Game / scope | Finite journaled quests | Main quest | Substantial joinable faction lines | Common time benchmark |
|---|---:|---:|---:|---:|
| **Morrowind GOTY** | **506** in Tamriel Rebuilt’s audit | **62** across base, Tribunal and Bloodmoon; base path is commonly represented as roughly 19 top-level stages or high-20s/low-30s when parallel recognition work is split | about **10** conventional base career lines when Great Houses are separate; GOTY adds East Empire Company | roughly **44–46h main / 99–105h main + sides / 296–329h completionist** |
| **Oblivion base** | about **204** journal quests | **18** | **5** major lines: Fighters, Mages, Thieves, Dark Brotherhood and Arena | roughly **27–28h / 85h / 184h** |
| **Skyrim base** | commonly audited as about **273** finite quests, excluding radiant loops | **18** | four major guild-like lines plus Civil War; Bards College is much smaller | roughly **26–35h / 110–111h / 203–237h** |

Morrowind’s GOTY faction audit is the most useful model: 31 Fighters Guild quests, 35 Mages Guild, 21 Morag Tong, 31 Thieves Guild, 30 Tribunal Temple, 39 Redoran, 30 Hlaalu and 29 Telvanni, alongside Imperial Cult, Legion and miscellaneous content. Individual entries vary in size; the important feature is the amount of authored content assigned to institutions and ordinary work before promotion.

## 3. What community research says to inherit

### Morrowind

Recurring praise in Reddit and fan discussion:

- ambiguous prophecy and uncertainty over whether the player is chosen, opportunistic or politically manufactured;
- Caius Cosades explicitly telling the player to establish a cover identity and gain experience;
- factions embedded in the economy, religion and politics of the province;
- multiple patrons and internal ideological divisions;
- morally compromised institutions with understandable reasons to join;
- competence, reputation and sponsorship requirements;
- books, testimony, ruins and interested institutions delivering contradictory lore;
- a dangerous central region visible and discussed before the player is prepared to enter it.

Recurring criticism:

- early delivery and retrieval errands;
- repetitive Hortator/Nerevarine recognition;
- late convergence after implied political complexity;
- limited post-quest acknowledgement;
- mechanical promotions without institutional responsibility;
- faction consequences that do not fully match the setting’s politics.

### Oblivion

Recurring praise:

- prisoner/sewer opening and immediate dramatic escalation;
- Martin as a developed recurring character;
- distinctive quest premises rather than generic objective templates;
- Dark Brotherhood scenarios such as *Whodunit?*;
- the Thieves Guild’s escalating capers and *The Ultimate Heist*;
- optional bonus conditions, infiltration and memorable locations;
- visual/staged peaks such as Kvatch, the Great Gate and Paradise.

Recurring criticism:

- repeated Oblivion Gates;
- *Allies for Bruma* as repeated endorsement work;
- apocalyptic urgency conflicting with open-world wandering;
- limited branching and modest systemic aftermath;
- another tendency to grant leadership after a short personal story.

### Skyrim

Recurring praise:

- Helgen’s readable onboarding and immediate spectacle;
- strong environmental staging around the first dragon, Greybeards, Alduin’s Wall, Paarthurnax and Sovngarde;
- recognisable faction headquarters and casts;
- atmosphere, betrayal and dungeon staging in the Thieves Guild;
- accessible objectives.

Recurring criticism:

- short and mostly linear faction arcs;
- automatic leadership with weak competence tests;
- compulsory lycanthropy or Nightingale commitments;
- radiant filler replacing institutional life;
- weak incompatibility between senior memberships;
- major choices producing limited follow-through;
- a known chosen-one identity removing interpretive ambiguity.

## 4. Resulting design rules

**Inherit:**

- Morrowind’s institutional depth, ambiguous claims, lore density, rank gates and willingness to lock content;
- Oblivion’s bespoke premises, escalating heists, recurring cast and memorable spatial set pieces;
- Skyrim’s readable tutorial, strong staging and clear landmark progression.

**Avoid:**

- pure fetch quests;
- repeated “clear the same kind of site” or “obtain six endorsements” structures;
- radiant tasks used as the main substance of a faction;
- compulsory transformations or oaths without informed alternatives;
- universal faction leadership;
- prophecy presented as uncontested developer truth;
- endings selected only by one final menu;
- huge battles or cinematic requirements beyond the engine/assets;
- world-state consequences that demand province-scale simulation.

### Quest cost tiers

Every authored quest is assigned a cost tier at brief stage. The tiers prevent the two failure modes this plan is most exposed to: a small number of over-produced showpieces surrounded by emptiness, and 300 quests that each demand showpiece production values.

| Tier | Share of total | Production budget | Design requirement |
|---|---:|---|---|
| **S — texture** | ~40% | Existing locations only; no new interiors; no state variants; 1–3 NPCs; single-stage or two-stage journal. | At least **one** design dimension from the list below. Deliberately modest, Morrowind-mundane work: a Tree-Minder wants a debt witnessed, a ferry pilot wants a rival's route timed, a widow wants a lie carried politely. Texture quests are allowed to be small and to resolve quickly. |
| **M — standard** | ~45% | One or two locations, possibly one small new interior; up to one local state variant; up to two approaches. | At least **two** design dimensions. |
| **L — showpiece** | ~15% | Bespoke multi-route spaces, multiple state variants, staged scenes. | At least **three** design dimensions. All main-quest act climaxes, faction finales and the two large heist/dungeon complexes are L. |

Morrowind's texture came precisely from its willingness to be mundane: short, technically simple quests about the small concerns of middle managers, which the showpieces then stood out against. Tamriel Rebuilt's quest guidelines make the same point explicitly. The multi-dimensional design requirement therefore applies to M and L tiers only, which protects delivery capacity and makes the province feel *more* like Morrowind, not less.

M and L quests should contain at least two (L: three) of the following:

1. investigation or interpretation;
2. a meaningful spatial problem;
3. more than one viable method;
4. a difficult decision;
5. a persistent local consequence;
6. a character or institutional reversal;
7. a system-specific verb: swimming, climbing, sailing, stealth, combat, magic, social leverage or evidence handling.

### Dramatic register: adventure carries the politics

The plan's political depth only works if it is *delivered through* danger, movement and spectacle. The ruling principle is **discover in danger, decide in council**: evidence should be won underwater, on rooftops, in cult cellars, mid-pursuit or at knife-point, and only *interpreted* in hearings and archives. A hearing is a payoff scene, never the substance of a quest. Any quest brief whose beats are entirely "read, talk, decide" must justify itself as deliberate S-tier texture or be redesigned.

Concrete rules:

- **Per-act minimum (main quest):** every act contains at least two quests whose centrepiece is physical — a dungeon, heist, chase, ambush, rescue, escape, boarding, infiltration under threat, or monster encounter. (Act I: MQ02 attack/escape, MQ04 marsh investigation with hostile interference. Act II: MQ09 prison tunnels, MQ10 wreck dive with rival pressure, MQ13 intercept, MQ14 night boat run, MQ16 guardian dungeon. Act III: MQ18 undercover with a live blown-cover escape route, MQ21 lab assault/rescue, MQ24 pursuit. Acts IV–V: MQ25 council under attack, MQ27–MQ30 expedition, D5 crossing, Lost City, boss.)
- **Per-faction minimum:** every major line contains at least three physically dramatic quests — at least one combat/monster set piece, one stealth/infiltration or chase, and one traversal set piece (dive, climb, boat, escape). Deep lines should exceed this comfortably; the Shadowscale and Night-Reed lines are action lines by nature, and the "talkier" lines (Nisswo, League, Sunken Archive, Umbriel Witness) meet the minimum through their existing spikes (NI05 violent sect raid, LW04 delegate-murder pursuit, SA08 escaped-experiment chase, UW03 submerged dwelling) plus the added beats specified in their tables.
- **Peril in investigation:** at least half of all evidence sockets in M/L quests should sit somewhere that costs something to reach — submerged, guarded, trapped, contested, collapsing or watched — rather than on an office shelf.
- **Cult sacrifice and horror are on-screen, not reported:** the Unbound Root's experiments (MQ21), the second Hist withdrawal (MQ15) and at least one interrupted ritual are witnessed spaces the player moves through, with bodies, restrained victims, ritual dressing and survivors — within the mature-content rules and existing assets.
- **Validation:** quest briefs tag their dramatic centrepiece (`COMBAT`, `STEALTH`, `CHASE`, `DIVE`, `CLIMB`, `HEIST`, `ESCAPE`, `SOCIAL`, `INVESTIGATE`); the validator reports per-act and per-line ratios, and flags any faction line or region packet where `SOCIAL`/`INVESTIGATE` exceed two-thirds of M/L quests.

### Wonder budget

The plan's political and institutional density is a strength, but Morrowind's identity was equally built on **strangeness that was not about politics**: the talking mudcrab merchant, prophetic dreams, Vivec's alien sermons, corprus, the sixth house's whispering statues. A province of hearings, registers and archives risks reading as a procedural in a swamp.

Rules:

- every accepted region contains at least **one purely strange, non-political encounter or place** with no faction stakes: a Hist that answers questions it was not asked, an ancient Argonian who claims to remember the Duskfall, a shrine where offerings vanish upward, a creature that trades;
- **sap-dreams are the game's signature mystical device** and must not appear only as surveillance evidence. At least three authored quests (including one main-quest beat) use a brief dream/vision sequence built from an existing interior cell with fog, lighting, audio and rearranged props — no new art;
- the Eye of Argonia is not a purely instrumental key. From MQ16 onward it occasionally reveals marks, inscriptions or brief visions the player did not ask for, including at least one that is never explained;
- opacity is preserved deliberately: some questions raised by wonder content stay unanswered, and no single NPC is authorised to resolve them.

### Cast

The province needs to be **populated**, not merely staffed. The character-design
rules, naming system, depth tiers, principal cast, per-faction recurring cast,
shared places, shadow networks and oddities roster all live in **[35-cast.md](35-cast.md)** —
read it before writing any named NPC. The four headline rules:

- **depth is proportionate to discoverability** (C1–C4 tiers); a character the
  player meets once gets one vivid detail and no backstory;
- **every recurring character carries a contradiction *and* a cheap quirk** — a
  contradiction alone is a position paper, a quirk alone is a mascot;
- **the Morrowind faction shape** (UESP-mined; evidence in
  `docs/research/morrowind-cast-structure.md`): each line is 3–5 stationary
  **desks** — quest-givers fixed at one post each, distributed across the
  line's settlements, each with a distinct ethic — with one live argument
  between two named desks that the player must eventually resolve. Recurrence
  is the player returning to a desk, never a character travelling;
- **nothing friendly recurs across lines**: cross-line texture comes from
  shared places, the same conflict seen from both sides, and unjoinable shadow
  networks (the Owing brokerage is our Camonna Tong) — never from imported
  recurring faces;
- **cliché budget**: at most one deliberate stock type per faction line, each
  carrying a subversion that changes how the quest is written, and none at all in
  the principal cast.

### Deliverability tiers — scripting complexity is a design constraint

This game is built by coding agents. A quest that needs an NPC to reliably run
across rooftops is not a more ambitious quest than one that doesn't; it is a
*worse* one, because it will consume weeks and still be flaky. Morrowind's whole
toolkit was cheap, and it was not less exciting for it.

**Every quest brief declares a delivery tier alongside its S/M/L cost tier.**

| Tier | Meaning | Share |
|---|---|---|
| **D-A — static** | Solvable with placed objects, dialogue topics, doors/locks, journal state, item checks and local state swaps. No AI behaviour beyond stock idle/patrol/combat. | ~55% |
| **D-B — assisted** | One bounded dynamic element: a timed sequence, a leashed follower on a waypoint spline, a scripted prop, a fixed-position boat, hostiles that come to the player. | ~35% |
| **D-C — bespoke** | Genuinely new runtime behaviour. Requires an explicit engineering budget, a named owner and a fallback that still ships if it fails. | ~10%, and never more than one per faction line |

**Cheap patterns — prefer these** (they are what Morrowind actually used):

- the world stays still and the *evidence* moves (state swaps);
- the same NPC in the same place with different dialogue (schedule swaps);
- **aftermath, not event** — show the result of a riot, a battle, a flood or a
  ritual, with bodies, damage and survivors, rather than staging it live;
- the player travels; NPCs stay where they are;
- enemies come to the player;
- doors, keys, locks, water, height and darkness as the obstacle;
- reading, testimony and physical evidence as the puzzle;
- timers and item-in-inventory checks;
- disguise and reputation as **flags**, not as AI perception;
- retrieval instead of escort — *they have already gone; go and find them.*

**Expensive patterns — convert them.** Each of these has a standard conversion:

| Instead of | Do this |
|---|---|
| A fleeing NPC chased across complex geometry | **Pursuit by inference**: the runner is gone through one of three exits; the player reads which (a wet print on a dry stair, a startled bird, a boat missing from its ring) and arrives at a *static* intercept. Wrong guess costs the best evidence, not the quest |
| Escorting a fragile NPC through hostile country | The guide **leads**, on a waypoint leash, invulnerable in transit. Cost is expressed in supplies, shelter and route state. Any casualty is authored at a fixed point, never emergent |
| Protect-the-NPC combat in a crowded scene | Fight in an **adjoining cleared chamber**; who survives is decided by where the player stood and who they pulled through the door, not by allied combat AI |
| Boat-versus-boat pursuit | The pursued craft runs a **fixed spline**; the player's problem is navigation — shortcuts, tide gates, a low bridge — not AI |
| A simulated crowd, riot or mass ritual | A **corridor of small authored pockets** with crowd audio and set dressing, in the Helgen model. Six active actors is the ceiling |
| A moving building, vehicle or route | **Two or three static configurations** selected by schedule or state (already the accepted fix for TG04's floating house — generalise it) |
| An NPC using the player's traversal verbs (climb, swim, sail) | They took the mundane route and are already there, or they wait at the top |

**Rules**: a quest may not be blocked by an actor failing to reach a mark
(existing §47 rule, now enforced by tier); a D-C beat needs a D-B fallback
authored at the same time; and any brief that names a chase, escort or crowd goes
back for conversion before it is costed.

### The boredom test

"Mundane" is allowed and wanted — roughly 40% of quests are deliberately modest
S-tier texture, and Morrowind's showpieces only stood out because of them. But
mundane is not the same as boring, and the difference is specific.

Community consensus on why Morrowind's small quests worked, and Tamriel Rebuilt's
own design guidance after they tried the alternative: **light instructions and
several viable approaches rather than a railroad; the value sitting in navigation,
world knowledge and faction politics wrapped around the objective; and the reward
often being standing, access or knowledge rather than gold.** CD Projekt's rule
from the other direction is the one-line version: no quest, however small, ships
without one twist or one thing you would remember it by.

Applied here:

1. **In an S-tier quest, the quest-giver is the payload.** The objective may be
   trivial; the person must not be. If the player would not repeat one sentence of
   theirs to a friend, rewrite the person, not the objective.
2. **One turn, minimum.** Every quest contains at least one thing that is not what
   it appeared to be — a second claimant, a wrong assumption, an inconvenient
   truth, a reason that is worse or sadder than expected.
3. **Never "collect N of X" as the whole quest.** A recovery objective is fine when
   ownership, route, danger, interpretation or disposition is the actual problem.
4. **Conflict is the essence of drama, and conflict is not only physical.**
   Internal, political, ecological, spiritual, generational, economic and
   procedural conflicts all qualify — but a quest whose conflict is *entirely*
   procedural must earn it by being short and by having a memorable person in it.
5. **Reward with the world**: access, a route, a safehouse, a permission, a
   standing, a name people now know, a fixed unique object with a history. Gold is
   the least interesting thing we can give.
6. **Vary the verb across a run of quests.** Six investigations in a row is a
   structural boredom risk even when each is individually good; the Act II
   treasure hunt is the plan's most exposed stretch and is handled explicitly in
   [30-main-quest.md](30-main-quest.md) §21b.

---

---
# Part XV — Acceptance criteria

The narrative programme succeeds when:

1. The main quest is recognisably about Argonia, the Hist, Sithis, the An-Xileel and the Eye—not a generic fantasy plot moved into a swamp.
2. Marsh traversal appears in the tutorial and throughout the early game.
3. Helstrom is accessible early and safe internally while its surroundings remain visibly lethal.
4. Required main-quest destinations escalate through the fixed danger map.
5. The Lost City is foreshadowed from Act I and remains a near-final D5 dungeon.
6. The player can remain loyal, reform from within, defect to the cult or act independently, across exactly five ending families (with the Kept Key as a hidden variant of the Hidden Eye).
7. A cult victory is coherent and fully supported.
7b. The cult is an active, felt presence throughout Act II — racing the player for leads, appearing through the Collector, and escalating with a second Hist withdrawal before MQ16 — never an off-screen rumour between MQ08 and MQ18.
8. The main factions are morally mixed and institutionally grounded.
9. The Thieves Guild contains at least one large, multi-route, memorable heist.
10. Shadowscales receive a lore-grounded Fourth-Era line.
11. Major faction endings carry lasting local consequences and some senior roles are incompatible.
12. No faction relies on radiant work as its core.
13. No substantial quest is a pure fetch quest.
14. Main/faction content does not require dynamic rivers, province simulation or new art.
15. Every quest references explicit world-generation provisions.
16. Every lore-dependent design has a URL/source reference.
17. Every unusual asset need points to vanilla Skyrim or a specific mod source.
18. All main content remains playable by every race.
19. Enemy and loot difficulty remain fixed.
20. Quest graphs, endings and fail-forward routes pass automated validation.
21. The world remains playable and coherent before, during and after every supported ending.
22. Every region contains at least one purely strange, non-political wonder encounter, and sap-dream sequences appear in at least three authored quests including one main-quest beat.
23. At least four mythic/Daedric quests from Part IX-B ship in Milestone 1.
24. Every quest declares an S/M/L cost tier, and roughly 40% of authored quests are deliberately modest S-tier texture in the Morrowind-mundane register.
25. Any quest whose approaches all require swimming, boats or climbing has a validated degraded fallback.
26. Milestone 1 (full main quest, four deep factions, four standard factions at 6–8 quests, two compact lines, 60–80 standalones, DQ01–DQ04) is completable and coherent before any wave-2 content lands.
27. The dramatic-register ratios hold: every main-quest act and every major faction line meets its physical set-piece minimums, and no line or region packet is more than two-thirds SOCIAL/INVESTIGATE among M/L quests.
28. The province is populated rather than staffed: every major faction line has 3–5 stationary desks with fixed posts and distinct ethics, a named argument between two desks that its finale resolves, and a come-and-go cast of vivid single-use characters; region packets draw cross-line texture only from shared places, declared collisions or shadow networks ([35-cast.md](35-cast.md) §53.5–53.6, §57).
29. No two desks in a line are interchangeable in a blind read of their quest lists; name forms, ages, races and registers are spread per [35-cast.md](35-cast.md) §54–55; and the cliché budget holds (≤1 flagged stock type per line, each with a declared subversion, none in the principal cast).
30. At least three cast members are correct in ways that are hard to accept, and at least three are wrong for honourable reasons; no character, including cult leadership, is wrong about everything.
31. Every region contains at least one purely strange non-political *person* as well as one strange place, and none of them is explained by any NPC or by the epilogue.
32. Every quest declares a delivery tier (D-A/D-B/D-C); D-C beats are ≤10% of quests, never more than one per faction line, and each has a D-B fallback authored alongside it. No quest brief ships containing an unconverted free-roaming chase, escort or simulated crowd.
33. Every quest passes the boredom test: it contains at least one reversal, no quest is a bare collection objective, and every S-tier quest has a quest-giver worth quoting.
