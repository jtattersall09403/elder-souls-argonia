# The style guide (binding)

> Read before writing any player-visible text. Per-people registers are in
> [culture-registers.md](culture-registers.md); review in
> [review-process.md](review-process.md). Router: [README](README.md).

Every "Morrowind does X" below is evidenced by a quoted line and its UESP page
name. Where we deliberately *depart* from Morrowind, it says so and why.

---

## 1. House rules

### 1.1 Spelling — **British** (owner ruling 2026-09-03)

Morrowind's own text is **American**: across ~50 UESP dialogue and book pages,
*armor* 75 / *armour* 0, *honor* 30 / *honour* 0, *learned* 12 / *learnt* 0,
*reorganized* not *-ised* (**Lore:A Short History of Morrowind**). UESP even
marks a British spelling in game text as an error —
`{{sic|defence|defense|description=British spelling}}` in **Lore:Brief History
of the Empire v 1**. The one survivor is *judgement*, which appears with the -e-
("I am ready to give you my judgement." — **Morrowind:Nibani Maesa**).

We nonetheless write **British English**, because Morrowind's American spelling
is an artefact of who published it, not a flavour anyone perceives as
Morrowind-ness — no player remembers the game as American-spelled — and because
every doc in this repo is already British. *Armour, colour, defence, realise,
grey, practise* (verb) / *practice* (noun), *-t* past forms where natural
(*learnt*, *spelt*).

**This is the one rule the owner should confirm** (decision 0043 §Open). It is
also the cheapest to reverse: the text catalogue is one keyed table.

### 1.2 Punctuation

| Thing | Rule | Note |
|---|---|---|
| Em dash | **`—`, spaced** | Morrowind writes ` -- ` ("blessed -- or cursed -- with remarkable abilities", **Morrowind:Nibani Maesa**). That is a 2002 font limitation, not a style. We depart. |
| Ellipsis | `…` (single character), sparingly | Morrowind uses `...` and even `....` for a trailing pause ("Let me think.... Yes." — **Morrowind:Gothren**). Keep the *use* — hesitation, evasion, a Telvanni thinking — and drop the four-dot form. **Never for mood** (quests 60 §45e.1). |
| Emphasis | **ALL CAPS on one word**, rarely | Morrowind's consistent convention across every register: "That's ALL that's free" (**Morrowind:Arrille**), "do NOT deliver them" (**Morrowind:Odral Helvi**), "he is VERY upset" (**Morrowind:Crassius Curio**). No italics in dialogue. Once per scene at most. |
| Quoted titles and speech inside a line | **single quotes** | "get Caius a copy of 'Progress of Truth'" (**Morrowind:Mehra Milo**). |
| Stage/system cues | `[square brackets]` | "[Chuckle.] Sorry." (**Morrowind:Aryon**); "[This path to your destiny is blocked.]" (**Morrowind:Caius Cosades**). Also editorial gloss in books: "[represented by the Heirographa -- the 'priestly writings']" (**Lore:Progress of Truth**). |
| Exclamation marks | one per scene, and it must be earned | Divayth Fyr may have four in a row; nobody else gets one. |
| Semicolons | books yes, dialogue almost never | The clearest single dialogue/prose divider Morrowind has. |

### 1.3 Capitalisation of in-world terms

Follow Morrowind's split exactly — it is what makes lore feel *lived in* rather
than *announced*.

- **Capitalised** — institutions, offices, prophecies, unique places and
  hyphenated coinages: House Redoran, Great House, the Tribunal, the Temple,
  the Empire, Imperial Legion, the Blades, Camonna Tong, Sixth House,
  Ashlanders, Clanfriend, Hortator, Nerevarine, Red Mountain, Ghostfence,
  Seven Graces, House of Troubles, Curse-of-Flesh.
- **lowercase** — creatures, materials, goods, foodstuffs, generic
  architecture, diseases: guar, netch, scrib, silt strider, ebony, moon sugar,
  skooma, drakes, yurt, foyada, canton, corprus, blight.
- **Native titles lowercase when generic, capitalised with a name**: "their
  ashkhan" but "Ashkhan Ulath-Pal" (**Morrowind:Nibani Maesa** has both).

**Our terms, ruled by the same test.** Capitalised: the Hist (and *a Hist*, *the
Hist* — capital as a species-proper), Sithis, the An-Xileel, the Veiled Reed,
the Root of Accord, the Owing, Shadowscales, Nisswo, Chukka-Sei, the Scalded
Throne, Duskfall, the Eye of Argonia. Lowercase: sap, hist-sap resin, xanmeer
(a building type — capitalised only in a specific ruin's name), rootworm,
lukiul, ojel, jel (the language is **Jel**, capitalised; the loanwords are not),
naheesh, wattle, trodh, deep-stick.

Rule of thumb: **if a hundred of them exist, it is lowercase.**

### 1.4 Numbers, dates, currency

- Spell out one to ten in prose; numerals above, and always for coin, distance,
  counts of things the player must track.
- Currency: **"drakes" colloquially in a mouth, "gold" mechanically in system
  text** — Morrowind's own split ("Here's 200 drakes." — **Morrowind:Caius
  Cosades**).
- Dates in-world use the canon calendar (lore: topics/sky-moons-calendar.md);
  system text does not print dates at all.

### 1.5 Names

Argonian name forms and their politics are **quests/35-cast.md §54** — the five
forms, the ≤⅓ Verb-the-Noun cap, the no-repeated-imagery rule. Do not restate
them; obey them. Canon shape, for reference:

- **Jel**: two hyphenated elements — Im-Kilaya, Haj-Ei, Am-Ali, Deem-Ra
  (**Lore:Argonian Names**).
- **Tamrielic**: a hyphenated verb phrase, often a literal translation of the
  Jel — "an Argonian named 'Haj-Ei' may take on the Tamrielic name 'Hides His
  Eyes'" (**Lore:Argonian Names**). Also: "most Argonians do not, as a rule,
  have family names."
- **Khajiit**: apostrophised prefixes — Ra'Virr, M'Aiq — or epithet-first
  (Sugar-Lips Habasi).
- **Imperial**: Latinate — Larrius Varro, Crassius Curio, Processus Vitellius.
- **Dunmer**: two- or three-syllable given + house name — Bolvyn Venim, Divayth
  Fyr, Odral Helvi.

**Place names** follow the per-region naming register in
[world/sources/catalogue/README.md](../../world/sources/catalogue/README.md).
A character's speech and their region's place names must sound like the same
world: do not write a "Bundle Racks" pirate speaking in the Hist heartland's
definite-article abstractions.

### 1.6 What we never do

- **No phonetic accent spelling.** No dropped h's, no "ye olde", no
  apostrophised dialect. Morrowind marks every race and class by *syntax and
  address terms only* — the sole systematic grammatical marker in the whole game
  is Khajiit illeism. This is the single most important negative rule here.
- **No modern idiom in a mouth that could not hold it** — "okay", "issue"
  (meaning problem), "reach out", "impact" as a verb, "process" as a noun.
- **No em-dash-and-gravitas syntax.** See §2.

---

## 2. The voice

The owner's directive (quests 60 §45e): **TES prose is plainer than people
remember.** Short declaratives. Concrete nouns. Archaism carried by *vocabulary
and idiom*, not by twisted syntax. When a line feels portentous, cut it in half;
what remains is usually the line.

The **banned-constructions table lives in [quests/60
§45e.1](../quests/60-writing-and-lore.md)** — it is the enforcement surface and
it grows. Read it. Do not copy it here.

### 2.1 The five things Morrowind's dialogue actually does

1. **The NPC simply knows.** Informational replies are confident, unattributed
   and complete. No hedging frame, no "well, I suppose you could say".
   > "We're spies. We're the Emperor's hidden eyes and ears in the provinces. We
   > watch the Emperor's enemies. We look for opportunities. We make reports."
   > — **Morrowind:Caius Cosades**

2. **One paragraph, one topic, one hook.** Every answer is self-contained and
   names at least one new proper noun the player can chase.
   > "Moonmoth Fort is the Imperial Legion garrison southeast of Balmora… Radd
   > Hard-Heart is the Knight in charge." — **Morrowind:Caius Cosades**

   This is the mechanism behind our newcomer-topic obligation (quests 60 §45d):
   the topic system *is* the teaching instrument. Answer, then hand over the
   next word.

3. **Directions are landmark prose**, never coordinates, and are repeated in
   the journal so navigation survives without a marker.
   > "Follow the coast east from Urshilaku camp to the ruined Dunmer stronghold
   > called Valenvaryon, then turn southwest… It is a bad place. Go prepared."
   > — **Morrowind:Sul-Matuul**

4. **Authority is written as procedure, and menace as hospitality.** The two
   most effective registers in the game are both understated. Gothren refuses
   by scheduling; Dagoth Gares threatens by welcoming.
   > "Your story makes sense. Your proofs are persuasive.... But a decision on
   > such a remarkable matter is a grave responsibility, and not to be taken in
   > haste." — **Morrowind:Gothren**
   > "The Sixth House was not dead, but only sleeping. Now it wakes from its
   > long dream…" — **Morrowind:Dagoth Gares**

5. **Vocabulary does the politics.** One word carries an entire relationship:
   Ordinators say *citizen* to the compliant and *outlander* to the suspect
   (**Morrowind:Ordinator**); *n'wah*, glossed in-game as "'foreigner' or
   'slave'" (**Morrowind:Hassour Zainsubani**); *Clanfriend* as a status
   conferred by a sentence. Build our equivalents the same way — *ojel*,
   *lukiul*, *the Owing*, *dryskin* — and **gloss them in a mouth**, as
   Morrowind does, never in a tooltip.

### 2.2 Dry wit is structural, not decorative

Morrowind is much funnier than its reputation, and the jokes are load-bearing —
they characterise the speaker in one clause.

> "You want a little advice? That's free. That's ALL that's free."
> — **Morrowind:Arrille**
> "Deader than a garlic snail." — **Morrowind:Divayth Fyr**
> "I'm just an old man with a skooma problem." — **Morrowind:Caius Cosades**
> "I'd rather make a monkey Hortator." — **Morrowind:Bolvyn Venim**
> (Background) "I am an Ordinator." — **Morrowind:Ordinator**

The Dunmer/Daedric insult idiom is **animal-based and specific**: "one born from
the wrong end of a guar" (**Morrowind:Anhaedra**), "gobbles sugar like scuttle"
(**Morrowind:Caius Cosades**). Ours are marsh-based and canon: "Hist piss!",
"dryskin fools and withered roots" (lore: topics/material-culture.md).

Per quests 35-cast §58 and 60 §46b: comic characters carry real information, and
at least two oddities per region must be genuinely funny.

### 2.3 Books are not dialogue

| | Dialogue | Documents |
|---|---|---|
| Syntax | main clauses, few subordinates | subordination, semicolons, bracketed gloss |
| Attribution | confident, unattributed | **authored and biased** — a Temple text and a Dissident text contradict, and the game never adjudicates |
| Archaism | almost none | *thy*, *anon*, *bade* permitted |
| Range | narrow | very wide — administrative parody to mythopoeia |

Evidence for the range, which is the point: scholarly (**Lore:A Short History of
Morrowind**), polemical (**Lore:Progress of Truth**), devotional with
parallelism and archaism ("Engrave upon thy eye the image of injustice." —
**Lore:Saryoni's Sermons**), guidebook-and-parable in one (**Lore:The Pilgrim's
Path**), bawdy playscript (**Lore:The Lusty Argonian Maid**), free verse
(**Lore:Words of the Wind**), bureaucratic parody ("…completely free of spooks,
boojums, snarks, spectral goats, revenant toiletries, or cannibal vampire
anchovies" — **Morrowind:Ghost-Free Papers**), and outright surrealism
("the Barons of Move Like This" — **Lore:36 Lessons of Vivec**).

**Rules for us.** Every document has an author with a motive, named or
inferable. Documents may be wrong. At least one document per region should be
mundane (a ledger, a repair list, a complaint) and at least one funny — a
province of nothing but grave scripture is a failure of nerve, and Morrowind
never made it.

Doctrinal formulas are cheap and enormously effective: the Temple's mandatory
parenthetical "(Blessed Be Their Holy Names)" (**Lore:The Anticipations**),
"Three Gods, One True Faith" (**Morrowind:Ordinator**). Give the Nisswo and the
An-Xileel one each and use them consistently.

---

## 3. The six surfaces

`TextSurface` in `packages/text-catalogue` determines which rules apply. Getting
the surface right is not bookkeeping — it selects the register.

### `dialogue`
§2 above, plus the character's voice sheet (quests 60 §46b) and the culture row
([culture-registers.md](culture-registers.md)). Contractions are normal.
Fixed slots keep Morrowind's shapes:
- **greeting** — trade or office, stated: "Nine-Toes is my name, Hunter is my
  trade." (**Morrowind:Nine-Toes**). Terse self-identification.
- **advice** — imperative and practical, aimed at a newcomer
  (**Morrowind:Arrille**).
- **rumour** — *the only systematically unreliable register in the game*.
  First-person, hedged, colloquial: "Well, I don't know if anyone else has seen
  him, but I saw some crazy guy…" (**Morrowind:Ashumanu Eraishah**). Rumours
  may be wrong, and some must be.

### `document`
§2.3.

### `journal`
**First person, past tense for events, "I'm to…" / "I must…" / "Now I'll…" for
the outstanding objective.** Full names and place names spelled out **every
entry** — the journal is the quest log *and* the search index. Directions
restated in landmark prose. Failure states get their own flat entry with the
consequence attached.

> "The Spymaster has sent me to talk to Hasphat Antabolis at the Balmora
> Fighters Guild. I'm to ask him what he knows about the Nerevarine secret cult
> … and return to report to the Spymaster." — **Morrowind:Antabolis Informant**
> "I have slain an Urshilaku Ashlander. This will make my mission to speak with
> Sul-Matuul and Nibani Maesa more difficult." — **Morrowind:Meet Sul-Matuul**

Deliberate redundancy: entries re-summarise the chain rather than incrementing.
Keep that — a player returning after a month reads one entry, not eight.

### `system`
**The place AI voice hides best**, because no character anchors the register.
Rules, absolute:
- State the **cause**, never the feeling. "You are carrying too much to move." —
  not "you feel weighed down".
- **Shortest form that is actionable.** "You have died." Two words.
- **No tricolons. No imagery** — with rare, deliberate exceptions carrying a
  recorded note (`text.system.rest-saved` is the one).
- Name the alternative when there is one: "You need a bed to rest here. Wait, or
  pay for a room."
- Where Morrowind's own phrasing exists and works, **use it and do not improve
  it** ("You cannot rest with enemies nearby.").

### `descriptive`
Item, place and creature descriptions. Concrete, material, one fact the player
could not see. No adjective stacking, no atmosphere. If it is a marsh thing,
someone made it out of something — say what.

### `ui`
Plain modern English. Buttons and labels are not in character; a menu that
speaks Dunmeris is a menu nobody can use. This is the one surface where our
voice rules deliberately stop.

---

## 4. Before you commit

1. Every string is in `packages/text-catalogue`, keyed, with `surface`,
   `speaker` and a `note` saying who is talking to whom and why.
2. Read your lines back with the speaker hidden. If they could belong to a
   different culture, they belong to none.
3. Run the review pass ([review-process.md](review-process.md)) — a *different*
   agent. A writer will not catch its own register.
