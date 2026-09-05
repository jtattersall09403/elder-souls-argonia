# Speech register in Morrowind — how the game varies NPC voice

Research for Elder Souls: Argonia dialogue/text-catalogue design. Source: UESP MediaWiki API
(`Morrowind:`, `Lore:` namespaces), fetched live 2026-09-04. Quotes cited from the named page.

## 1. The mechanical model

Morrowind composes voice from **structural filters on dialogue rows**, not
freeform race-flavoured writing per NPC. Each topic/greeting/rumour entry can
be conditioned on **Race, Class, Faction + Rank, Cell/Region, Sex, PC
faction/rank, Disposition threshold**, plus scripted state. **Morrowind:Sul-
Matuul** shows disposition gating: `[Disposition -20.] "Save your breath..."`
replaces the neutral greeting below threshold. **Morrowind:Aundae Clan** /
**Morrowind:Quarra Clan** show faction-membership filters in the same cell:
"Aundae Cattle have unique dialogue for vampires who share their masters'
blood… And for those who aren't vampires…" — same location, different line
by listener faction. Confirms faction is a hard filter axis, not a
stylistic gloss.

Generic (non-unique) dialogue is catalogued per topic across **Morrowind:
Generic Dialogue A–Z**: lines "repeated by many different NPCs," where "the
dialogue options with any given NPC often depends" on that filter set — one
shared pool of topic lines, sliced by conditions. Build our dialogue as
**(topic × condition-set) → line**, not monolithic per-NPC scripts, so
register composes rather than duplicates.

## 2. RACE markers

- **Khajiit — illeism (third-person self-reference).** Ajira never says "I": *"Has %PCName found the
mushrooms Ajira needs?"* (**Morrowind:Ajira**). Sugar-Lips Habasi does the same: *"Did you get the
Nerano Manor key for Habasi?"* (**Morrowind:Sugar-Lips Habasi**). Consistent across two unrelated
Khajiit NPCs — a genuine race marker, not idiolect.
- **Argonian — Jel-shaped emotional qualifiers, understated formality.** Tamrielic-speaking
Argonians often preface statements with a qualifier translating body-language, e.g. *"I erect the
spine of…"*, *"I extend the claw of welcome, warrior"* (**Lore:Jel**). Huleeya's in-game lines are
clipped and wary rather than qualifier-laden — *"I am preoccupied with my own affairs… Please leave
me alone"* (**Morrowind:Huleeya**) — the trait is present in lore but toned down for playable
dialogue. LORE_INFERRED for the ornate qualifier form beyond simple greetings.
- **Dunmer — honorifics and slurs.** *"sera"/"muthsera"/"serjo"* are attested Dunmer address forms
(LORE_INFERRED, pending a Dunmeris dialogue pull). The slur **n'wah** ("foreigner" or "slave") is
glossed in-game: *"'N'wah' means 'foreigner' or 'slave.'"* (**Morrowind:Hassour Zainsubani**); a
Dunmer hireling uses it against an Argonian bystander: *"Get out of our way, n'wah… filthy lizard…"*
(**Morrowind:Urven Davor**) — cross-racial, not reserved for one target. **fetcher** is the series'
general profanity substitute for the real-world expletive, not Dunmer-specific (**Lore:Profanity**).
s'wit not found in-sample — LORE_INFERRED.
- **Imperial — officialese/legalism.** Legion dialogue uses rank-formal, procedural language: *"Your
activities have led some to question your allegiance… Would you care to explain yourself, %PCRank
%PCName?"* / *"Your record will be permanently marred by this incident."* (**Morrowind:Imperial
Legion**) — FACTION-conditioned, but delivered mostly through Imperial-affiliated NPCs, so it
doubles as the game's model for "Imperial officialdom" tone.
- **Nord/Orc/Bosmer/Breton/Redguard/Altmer** — not directly evidenced this session (no dedicated
dialogue page pulled). LORE_INFERRED: Nord bluntness/oaths, Orc directness and blood/oath
vocabulary, Bosmer wry naturalism, Breton courtly diplomacy, Redguard blunt martial pride, Altmer
supercilious formality. Follow up with **Morrowind:Generic Dialogue Voiced** (confirmed to exist;
per-race "Hello, greetings to you, X" voice barks) before citing verbatim.

## 3. CULTURE/UPBRINGING (same race, different voice)

- **Ashlander vs Great House Dunmer — the largest proven contrast.** Ashlanders formally reject
outlanders: *"You are in the wrong place, outlander. Leave, now."* (Nibani Maesa, wise woman), *"How
did you get in here? Leave at once, or I will kill you myself."* (Sul-Matuul, ashkhan) —
**Morrowind:Nibani Maesa** / **Morrowind:Sul-Matuul**. **Morrowind:Ashlanders** describes the
culture: "very proud," "internal culture is very polite, but they hate foreigners," honour-challenge
customs around uninvited entry. Great House Dunmer NPCs (Curio, Venim, §5) use house-political
register instead — same race, opposite tone.
- **Assimilated vs traditional Argonians.** Huleeya (city-dwelling, target of racist harassment in
Vivec's Foreign Quarter) speaks defensively and plainly with no Jel qualifiers — contrast with the
ornate Jel-qualifier pattern in **Lore:Jel** for traditional Black-Marsh Argonians. Same race,
different upbringing, different register: treat "assimilated" as its own slider independent of race.
- **Cyrodiil-born vs provincial** — not directly evidenced this session. LORE_INFERRED from the
Legion officialese pattern (§2) holding regardless of an NPC's race: institution overrides
birthplace once enculturated.

## 4. REGION

Region acts as a topic-availability filter more than a distinct grammar: NPCs
in a given settlement share local rumour subjects and place names regardless
of race. The clan/vampire-coven pages show the same mechanic at smaller
scale — anyone inside a given faction-controlled cell gets that cell's line
set. No fetched page gave a clean "same line, different region" pair this
session; follow up with **Morrowind:Generic Dialogue** regional rumour rows
(catalogued by settlement name in the Generic Dialogue A–Z set) before
writing region-specific text for Black Marsh settlements — reuse that filter
mechanism (topic keyed to region/cell) rather than inventing a new one.

## 5. FACTION/CLASS

- **Temple (Ordinators)** — devotional citizen-address register: *"Praise Vivec!"*, *"What words do
you have for me, citizen?"*, *"Justice never sleeps. Almsivi watch over you."*
(**Morrowind:Ordinator**) — overrides individual race; all Ordinators speak in this register while
on duty.
- **Great House Hlaalu (Crassius Curio)** — informal, transactional, patronage pet names: *"you can
call me Uncle Crassius,"* *"dumpling,"* *"sweetie-pie"* (**Morrowind:Crassius Curio**) — a world
away from Ashlander gravity despite both being Dunmer.
- **Great House Redoran (Bolvyn Venim)** — clipped, martial, honour-bound: *"Unless you have some
important business to discuss, outlander, I suggest that you leave."* … *"We fight to the death,
%PCName."* (**Morrowind:Bolvyn Venim**) — distinct again from Curio despite same race and same
"House politician" class.
- **Imperial Legion vs Fighters Guild** — Legion uses rank-formal procedural address (§2); no
comparably strong Fighters Guild greeting text was recovered this session (**Morrowind:Fighters
Guild** page is mostly service/rank tables) — flag for follow-up rather than invent a contrast.
- **Vampire clans (Aundae/Quarra)** — the cleanest FACTION-only contrast: identical narrative role
(greeting a stranger) produces opposite tone by clan doctrine — Aundae (mind-gifted, contemptuous):
*"What do you want, New Blood?"*; Quarra (physical-gifted, blunt): *"Don't waste my time,
accident."* (**Morrowind:Aundae Clan**, **Morrowind:Quarra Clan**). Their thralls split the same
way: Aundae cattle beg (*"Please. No."*), Quarra cattle submit (*"I submit to your will."*).
- **Class-conditioned greetings (guard/commoner/noble)** — implied by the condition model (§1: Class
is a filter column) but no guard-vs-commoner pair was pulled this session. LORE_INFERRED to follow
the same per-topic mechanism; needs a **Morrowind:Generic Dialogue** class-keyed pull to cite
verbatim.

## 6. Precedence when markers conflict

Evidence-based ranking, strongest first:
1. **Scripted/quest state and disposition** always win — Sul-Matuul's greeting switches to a kill
threat below a disposition threshold, overriding every other marker (**Morrowind:Sul-Matuul**).
2. **Faction/on-duty role** overrides race and culture: Ordinator devotional register, Legion
procedural register, and vampire-clan doctrinal register are consistent regardless of the NPC's race
— the strongest non-scripted override, directly evidenced (§5).
3. **Culture/upbringing** overrides base race markers for the same race: Ashlander vs Great House
Dunmer is a bigger gap than any Dunmer-vs-other-race gap evidenced this session (§3).
4. **Race markers** (illeism, Jel qualifiers, slur targeting) persist as a light substrate
underneath — Ajira (Khajiit, Telvanni-guild member) still uses illeism inside guild dialogue; not
suppressed by faction, just thinner. LORE_INFERRED as a general ranking; directly evidenced only for
the NPCs cited.
5. **Region** supplies subject matter (place names, local rumours), not grammar — composes alongside
the above rather than competing with them.

## 7. Anti-patterns Morrowind avoids

No fetched page shows phonetic accent spelling (dropped-g's, reduplicated
letters) or broken/pidgin grammar to mark a non-human or non-Imperial race.
Race and culture are signalled through **address terms, self-reference
conventions (illeism), formality register, and vocabulary choice** (n'wah,
sera-class honorifics, Jel qualifiers, Legion procedural phrasing) — never
misspelling or grammatical breakdown. Consistent across every NPC quoted,
including both Khajiit (Ajira, Sugar-Lips Habasi) and the Argonian (Huleeya):
full, correctly-inflected Tamrielic sentences throughout.

## How we use it

Build Black Marsh dialogue as a **topic × condition-set → line** table (race,
culture/upbringing, faction+rank, region/cell, disposition), mirroring
Morrowind's engine model, not hand-written monolithic per-NPC scripts. Rank
faction/on-duty role strongest, culture/upbringing next, race markers as a
thin persistent substrate, region as subject-matter only. Mark every voice
trait not directly evidenced here as LORE_INFERRED. Never simulate accent via
spelling or broken grammar — use address terms and vocabulary instead. Follow
up with **Morrowind:Generic Dialogue Voiced** and a Dunmeris dialogue pull
before finalising Dunmer honorifics/slurs and per-race barks.
