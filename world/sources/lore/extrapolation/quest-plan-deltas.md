# Proposed changes to docs/quests/ — for a follow-up agent to apply

> **STATUS: ALL 16 DELTAS APPLIED to docs/quests/ on 2026-08-24.** Each delta
> below carries an `APPLIED:` line; tensions and judgement calls are recorded
> under "## Application notes" at the bottom.

The lore workstream **does not edit `docs/quests/`**. This file records the
changes the Packet 1–3 sweep says are needed, with the reasoning and the citation
that justifies each. A follow-up agent applies them, with a pointer back to the
lore file named in the "Justified by" column.

Raised 2026-08-24, extended after packets 4–7. **All deltas are now unblocked**:
the owner accepted all five Round-1 recommendations on 2026-08-24, so D1 and D2
are approved in substance and need only wording. D1–D10 came from the sweep and
the synthesis; **D11–D16 came from the settlement, Hist, guild and ecology
packets.**

**Overall assessment first, because it matters**: the quest plan holds up
extremely well against a full canon sweep. `The Empty Cradle` correctly builds on
the Shadowscales' canonical extinction; `Nisswo of the Turning Path` correctly
treats Nisswo practice as interpretive rather than a death cult; `League of Open
Water` correctly grounds itself in the canonical Lukiul/Saxhleel tension; the
`Umbriel Witness Society` and `Rootworm Waykeepers` are built on real canon.
Most of what follows is **sharpening and dating**, not correction.

---

## D1 — `10-political-frame.md` §5: the An-Xileel in 4E 201 `APPROVED — Q1 accepted`

**Current text**: "The **An-Xileel** remain the strongest known Fourth-Era
nationalist movement… Project interpretation: the An-Xileel are a powerful
province-wide movement and security/state network."

**Problem**: Lore:Accession War states the Umbriel disaster "appears to have
**broken the hold the An-Xileel held over the Argonian people**, and the mysterious
party **receives no mention in the following centuries**." Lore:An-Xileel: "The
status of the An-Xileel following the Umbriel Crisis is **unknown**." Our era is
153 years after that. The plan's framing is defensible but runs against canon's
own trajectory, and the sweep found no supporting 4E evidence at all.

**Proposed change** (Q1 Option B — successor state): keep every structure, change
the standing. Replace the bullet list's first two items with something like:

> - the An-Xileel of 4E 201 are **not the movement of 4E 6**. The Umbriel
>   catastrophe of 4E 48 — which their own leadership caused, through a Hist that
>   was using them — destroyed their seat at Lilmoth and broke their hold on the
>   Argonian people. What survived is a **successor administration** that
>   inherited the party's offices, titles and name: **Archwardens**, the ruling
>   council still styled **the Organism**, a customs regime at the ports, and the
>   frontier screen facing Morrowind;
> - its writ is real at the borders and the ports and thin everywhere else. Its
>   legitimacy is openly contested — most sharply in **Gideon** and **Lilmoth**,
>   the two cities its predecessor's weapon killed;

**Why this helps the plan rather than costing it.** The Unbound Root's doctrine
already argues that "the An-Xileel cannot claim to speak for all Hist or all
Argonians" — under this framing that claim is *demonstrably true*, not merely
arguable, and the faction's critique gains teeth. And the Veiled Reed's stated
internal contradiction ("it protects an independent province with real enemies
while using secrecy and coercion") becomes far sharper when the province's worst
enemy in living memory **was its own state**.

**Justified by**: [../an-xileel.md](../an-xileel.md) sweep addendum;
[../topics/history-timeline.md](../topics/history-timeline.md) 4E section;
[argonia-4e201-state.md](argonia-4e201-state.md) §1–2.

**APPLIED:** `10-political-frame.md` §5 intro and first bullets replaced with the
successor-state framing (Archwardens, the Organism, contested legitimacy, naming
asymmetry); §6 Veiled Reed reworded as an office of the successor state with the
sharpened founding-crime contradiction; §9 Helstrom/Stormhold rows updated;
`00-overview.md` Veiled Reed description updated.

---

## D2 — `10-political-frame.md` §5: Lilmoth's description

**Current**: "Lilmoth is a major An-Xileel and commercial centre whose Umbriel
history remains politically sensitive."

**Problem**: understated. Canon does not say Umbriel *touched* Lilmoth — it says
the "Slaughter at Lilmoth" **culminated in the city's destruction**
(Lore:Lilmoth). "Politically sensitive" describes an awkward memory; this was the
annihilation of the city by its own government's weapon, directed by its own
Hist, aimed explicitly at "assimilated" Argonians.

**Proposed change**: "Lilmoth was **destroyed** in 4E 48 and rebuilt smaller and
lower on the same ground; its drowned Imperial quarter is unrepaired, its third
Hist grew from the second's root and is watched with open fear, and the city's
politics are inseparable from the fact that its own government summoned the thing
that killed it."

**Justified by**: [../lilmoth.md](../lilmoth.md) sweep addendum;
[argonia-4e201-state.md](argonia-4e201-state.md) §4; see also
[owner-questions.md](owner-questions.md) Q4 for the one owner decision inside it.

**APPLIED:** `10-political-frame.md` §5 Lilmoth bullet and §9 Lilmoth row
rewritten to destroyed-in-4E 48, rebuilt-not-restored, hostile to the successor
state, drowned quarter unrepaired, feared third Hist.

---

## D3 — `40-factions.md` §31 (The Empty Cradle): date the collapse precisely

**Current premise**: "A contested attempt to revive an order that Skyrim's
Veezara calls extinct."

**Addition available at zero cost** — canon gives exact dates and an existing
antagonist:

- The **Archon training facility was shut down in 4E 187** — fourteen years before
  play. It is standing, and it is the natural site for `LOC
  shadowscales.safehouse_ruin` or a sibling location.
- **Listener Alisanne Dupre of the Cheydinhal sanctuary, and a member named
  Rasha, planned to revive the facility** "in response to the Brotherhood's
  decline". That is a **canon-named external faction with a canon-named motive
  already trying to do what the questline is about** — SS08 ("The State's Hand",
  the Veiled Reed's charter offer) gains an obvious third bidder.
- **The last known living Shadowscale dies in 4E 201.** The line can be dated to
  that death.
- The **Black-Tongues (Kota-Vimleel)** "dedicate almost all their resources" to
  producing Shadowscales and have had nowhere to send Shadow-born hatchlings for
  fourteen years. What they have been doing with them instead is the single
  strongest unclaimed hook in the questline.

**Proposed change**: add the 4E 187 / 4E 201 dates and Dupre/Rasha to the
premise and to SS01's and SS08's source columns; add a Black-Tongue quest beat.

**Justified by**: [../topics/sithis-nisswo-shadowscales.md](../topics/sithis-nisswo-shadowscales.md);
[../archon.md](../archon.md) sweep addendum.

**APPLIED:** `40-factions.md` §31 premise dated (4E 187 closure, last Shadowscale
dies 4E 201) with Dupre/Rasha and the Black-Tongue hook; SS01 is now that death
and sites the safehouse ruin at the Archon facility; SS04 gains the Black-Tongue
claimant beat; SS05 tied to the Cheydinhal revival plan; SS08 framed as the third
bidder.

---

## D4 — `40-factions.md` §35 NI05 ("Teeth of Sithis"): two canon facts to fold in

1. **The Teeth of Sithis is a real place**: "the largest known temple of Sithis in
   Murkmire", site of pre-Duskfall mass blood sacrifice, and **still cared for by
   the Clutch of Nisswo** even though it no longer serves its original purpose.
   The quest currently uses the name for a violent sect; using the **place** as
   the setting is stronger and free.
2. **Canon already has the violent sect**: the **Sul-Xan**, a Naga cult who worship
   **Mehrunes Dagon as "the Razor Prince" and the "True Egg-Child of Sithis"**,
   "embracing only the darkest, cruelest beliefs and scorning the rest as
   weakness", based at Xi-Tsei / Rockgrove / the Silent Halls in Blackwood. Using
   them, or a splinter of them, means the "sincere theology vs criminal
   opportunism vs state provocation" question has a canon answer available for
   each branch.
3. Add the canon precedent that the **High Priestess of the Teeth, Xulneihavu
   Shuxaltsei, survived Duskfall as a vampire and briefly retook the temple** —
   a pre-Duskfall Nisswo-King's return is exactly this quest's nightmare.

**Justified by**: [../topics/sithis-nisswo-shadowscales.md](../topics/sithis-nisswo-shadowscales.md);
[../tribes.md](../tribes.md) sweep addendum.

**APPLIED:** `40-factions.md` NI05 rewritten around the canon Teeth of Sithis
temple (tended by the Clutch), a Sul-Xan splinter as the violent sect, and the
Shuxaltsei precedent; provision now `LOC murkmire.teeth_of_sithis`.

---

## D5 — `40-factions.md` §38 LW01 ("Citizen of No Hist"): canon has the remedy

The premise — a resident denied civic registration because no local Hist claims
them — is excellent and canon-true (Hist-less Argonians are *lukiul*, treated as
outsiders even by their own kin).

**Canon adds a complication the quest should know about**: **Hissmir**, in
southern Shadowfen, exists precisely for this. Its **Trials of the Burnished
Scales** let Hist-less Argonians — *and even non-Argonians* — commune with the
Hist, and lukiul pilgrims come from all over Tamriel "to find that missing piece
of themselves". The trials are administered by the **Root Stewards**, and by
ancient tradition the Stewards **cannot refuse a comer** (canon: they could not
bar a hostile Dominion captain).

That turns LW01 from "can this person be registered?" into the much sharper
"there **is** a remedy, it is a three-day ordeal in a xanmeer four hundred miles
away, and the registry says a pilgrimage certificate is not proof" — which is
exactly the civic-standing-versus-tradition argument the League line is about.

**Proposed change**: add Hissmir and the Root Stewards to LW01's provisions, and
consider a Hissmir location requirement in `20-world-provisions.md`.

**Justified by**: [../regions/shadowfen.md](../regions/shadowfen.md);
[../topics/hist-and-sap.md](../topics/hist-and-sap.md).

**APPLIED:** `40-factions.md` LW01 narrative and provisions gained Hissmir, the
Trials and the Root Stewards ("a pilgrimage certificate is not proof"); Hissmir
added to the new canon-locations table in `20-world-provisions.md` §12b.

---

## D6 — `40-factions.md` §36 MR03 ("The Borrowed Tree"): the mechanism is canon

The premise (a Lukiul district planted a Hist cutting generations ago; a nearby
tribe says it was taken without consent) is strong. Canon supplies the *stakes*:

- An Argonian's **entire physiology and appearance** derive from their Hist's
  **gloor**; traits fade with distance from the tree and return on coming home.
- A tribe's **souls return to its Hist**; drain or distil the sap and the tribe's
  dead have nowhere to go and linger mad; the tree feels it and so do they.
- Precedent exists both ways: the **Blackwood Company smuggled an entire Hist out
  of Black Marsh** to Leyawiin and tapped it, and the **Veeskhleel** perpetuate
  themselves entirely by **stealing eggs** and hatching them under their own tree.

So the dispute is not about property or sentiment: **the district's children now
belong, physically and spiritually, to a tree the tribe says was stolen.**

**Justified by**: [../topics/hist-and-sap.md](../topics/hist-and-sap.md).

**APPLIED (with D12):** `40-factions.md` MR03 rewritten to carry the canon stakes
— gloor, souls returning to the tree, and the Blackwood Company / Veeskhleel
precedents.

---

## D7 — `10-political-frame.md` §9 table: two regional corrections

1. **Thorn / north-east should not read as swamp.** Lore:Thornmarsh: "Like the
   rest of **northern Black Marsh**, the area has more **temperate grasslands**
   compared to the swampier areas in the south." The plan's regional table doesn't
   say otherwise, but the world build will default to swamp unless told. Add a
   note that Thornmarsh is **grassland with saltrice plantations**.
2. **Gideon's Argonians are canonically majority Lukiul**, stated outright on
   Lore:Gideon — not merely "Imperial-descended presence ~22%". Gideon is the
   Lukiul city, and it lost that population to the An-Xileel's own weapon in
   4E 48. That is the strongest possible grounding for the plan's Lukiul-versus-
   sovereignty theme and it should be named in the table.

**Justified by**: [../regions/thornmarsh-and-east.md](../regions/thornmarsh-and-east.md);
[../gideon.md](../gideon.md) sweep addendum.

**APPLIED:** `10-political-frame.md` §9 Thorn row now carries the
grassland/saltrice region note; the Gideon §5 bullet and §9 row state canon
majority-Lukiul and the 4E 48 loss of that population.

---

## D8 — `20-world-provisions.md`: locations canon supplies that the plan should claim

None of these require new invention; all are canon places the quest plan's
existing lines would benefit from, and all are cheap for the world build because
their character is already written.

| Place | Canon | Which line it serves |
|---|---|---|
| **Hissmir** (S Shadowfen) | Pilgrimage xanmeer; Trials of the Burnished Scales; Root Stewards; Fish Boon Feast | League of Open Water (D5), Many-Root Conclave |
| **Glenbridge** (SE Blackwood) | Village around a ruined Sithis xanmeer whose Nisswo read its decay as the god's sermon; the voriplasm-sorcerer Rectavius sealed beneath | Nisswo of the Turning Path |
| **Teeth of Sithis** (Murkmire) | Largest Sithis temple; still tended by the Clutch | Nisswo (D4) |
| **Deepmire** ("the Refuge") | Cursed plateau even locals avoid; the tribes' shelter of last resort; xanmeers and swamp-leviathan bones | A D4/D5 space that is *not* the Lost City |
| **Stonewastes** (Blackwood) | Hist in the town centre, a xanmeer keep, and the **Four Winds** hereditary defenders | Marsh Charter (Fighters Guild) — a canon-native martial tradition |
| **Alten Meerhleel** (Murkmire) | Port built to trade with outsiders; tribes placated with a **Teeba-Enoo court** | League of Open Water, Reed-Sail |
| **Bramman's river** (Soulrest→Blackrose) | Concealed navigable mangrove channel a fleet once sailed | Reed-Sail Compact / Salt-Teeth |
| **Murkwood** | The forest that ever moves; located only by the **Conclave of Baal at Stormhold** reading the Elder Scrolls with an ancient tablet | Sunken Archive, artifact quests |
| **White Rose Prison** (unlocated) | Named twice; Argonians who died there still need their bones brought to the dirt | Blackrose Chainbreakers |
| **The Archon Shadowscale facility** | Closed 4E 187; the Cheydinhal Listener wants it back | The Empty Cradle |

**APPLIED (with D16):** merged into a single canon-locations-and-systems table
as new §12b of `20-world-provisions.md`, with per-row "serves" pointers.

---

## D9 — `60-writing-and-lore.md`: register and idiom

The sweep produced a large body of canon Argonian speech habits that should bind
dialogue authoring rather than being rediscovered per-quest: **Jel has no past or
future tense**; word order is fluid; there is no grammatical difference between an
agent and an action; body language carries grammar, not just tone, which is why
Argonians speaking Tamrielic preface statements with emotional qualifiers
("I erect the spine of…", "I shake my head in disbelief", "My rage-quill is
engorged!"). Farewell: "**Stay moist.**" Curse: "**Hist piss!**" Exclamation:
"**Host of Stormhold.**" Outsiders are **ojel** (not derogatory); the An-Xileel's
**Lukiul** is (very much so).

**Proposed change**: add a short "Argonian register" subsection pointing at
[../topics/material-culture.md](../topics/material-culture.md) § *Language notes
for dialogue* rather than duplicating it.

**APPLIED:** `60-writing-and-lore.md` new §45b "Argonian register" — headline
habits plus a binding pointer to the dossier section.

---

## D10 — Two small factual corrections

1. **Archon was founded by the Barsaebic Ayleids** (Lore:Barsaebic Ayleids lists
   it with Silyanorn, Twyllbek and Thorn). Any material treating Archon as purely
   Lilmothiit/Cantemiric in origin should add the Ayleid substratum — Archon and
   Thorn have the same foundation layer as Stormhold and Gideon.
2. **The Shadowscales' "Argonian Royal Court" is probably fictitious.**
   Lore:Kingdom of Black Marsh: the **Scalded Throne** "has supposedly been empty
   for centuries (if it existed at all), and the monarch's role as commander of
   the Shadowscales is said to be overstated." Any quest text implying a real
   royal chain of command should present it as **a claim the order made about
   itself**. This *strengthens* the project reading that the Eye of Argonia grants
   no kingship — canon has already decided the throne is empty.

**Justified by**: [../archon.md](../archon.md);
[../topics/sithis-nisswo-shadowscales.md](../topics/sithis-nisswo-shadowscales.md).

**APPLIED:** (1) no quest module claimed a non-Ayleid Archon origin; a one-clause
Barsaebic-Ayleid foundation note was added to the §9 Archon row to lock it in.
(2) `10-political-frame.md` §8 Eye bullet and `40-factions.md` SS02 now carry
the empty-Scalded-Throne caveat (royal command a claim the order made about
itself).

---
---

# From packets 4–7

## D11 — `60-writing-and-lore.md` and all faction lines: the trauma calibration

The owner's binding directive (2026-08-24): **the generational trauma of 4E 48
plays at the emotional distance our own 2026 has from the First World War.** This
is now the governing tone rule for every quest that touches Umbriel, the
An-Xileel, the Lukiul question or the southern cities, and it changes how several
existing lines should be written:

- **No living witnesses.** Argonian lifespans are human-like `CANON_EXPLICIT`, so
  anyone claiming to remember Umbriel is lying, mistaken, or not what they seem.
  The **Umbriel Witness Society** (§41) is therefore an organisation of
  *inheritors and archivists*, not survivors — which is a stronger premise and
  should be stated in its description.
- **An NPC should be able to be bored by it.** 153 years makes it history:
  argued about, politicised, taught badly, exploited, and occasionally shrugged
  at by the young. Playing it that way is what makes the places where it *is*
  still raw land properly.
- **It is not universal.** Thornmarsh and Archon were barely touched; Murkmire,
  Lilmoth, Gideon and Stormhold carry it. Faction content should not assume a
  province-wide wound.
- **The Nisswo counter-argument is sympathetic.** A Nisswo telling a grieving
  community to let go is preaching *shunatei*, not being callous. Any quest that
  frames memorial-versus-letting-go should argue both sides honestly — this is
  the most Argonian tension in the setting.

**Justified by**: [argonia-4e201-state.md](argonia-4e201-state.md) §9.

**APPLIED:** `60-writing-and-lore.md` new §45c "The 4E 48 calibration" (binding
tone rule: no living witnesses, boredom allowed, not universal, Nisswo
counter-argument sympathetic, melancholy-and-dignified register);
`40-factions.md` §41 Umbriel Witness Society intro rewritten as inheritors and
archivists, not survivors.

## D12 — `40-factions.md` §36 (Many-Root Conclave): MR03 now has a site and a mechanism

MR03 "The Borrowed Tree" can be sited concretely: **Gideon's Hist is a planted
cutting in the city gardens among the Ayleid ruins, of disputed provenance**, and
a Gloommire tribe claims it was taken. Canon permits transplanting (the Blackwood
Company smuggled an entire Hist to Leyawiin), and Gideon is `CANON_EXPLICIT`
majority **Lukiul** — a population that cannot hear the Hist — which is exactly
why a cutting would have been planted.

The stakes are canon and severe: through **gloor**, the district's children now
belong physically and spiritually to a tree the tribe says was stolen; and souls
return to the tree they came from.

**Justified by**: [../topics/hist-placement.md](../topics/hist-placement.md) §3;
owner Round-2 **Q9** (flagged, recommendation A).

**APPLIED (with D6):** MR03 sited at Gideon — `LOC gideon.hist_garden` among the
Ayleid ruins, Gloommire tribal claimant — citing owner decision Q9.

## D13 — `40-factions.md` §32 (Night-Reed Chapter): two canon gifts

1. **The Night-Reed should be native, not a franchise.** Canon: the Thieves Guild
   "operates along provincial lines, with little if any apparent coordination",
   and "guilds in some of the provinces have been unheard of for centuries". There
   is no Imperial chapter in Argonia and never really was — the native equivalents
   canon *does* name are **Pusbottom**, **Alten Corimont**, the **Blackguards**
   and the **tribeless Naga**. Reading the Night-Reed as a native organisation a
   Cyrodiilic guild would recognise as a peer is more distinctive and better
   grounded.
2. **A heist mechanic, free**: in Lilmoth, **ripper eels are trained to hunt
   Argonians illegally crossing the canals — "though they do not attack people who
   have rubbed themselves with eel-slime"** (Lore:Ripper Eel). A security system
   that is a trained animal with a known, obtainable, revolting counter is ideal
   for the major Lilmoth heist the plan already wants.

**Justified by**: [../topics/guilds-and-orders.md](../topics/guilds-and-orders.md) §3;
[../topics/ecology-encounters-loot.md](../topics/ecology-encounters-loot.md) §2.

**APPLIED:** `40-factions.md` §32 premise rewritten as a native organisation (a
peer, not a franchise; canon precedents named); TG10 gains the ripper-eel canal
hazard with the eel-slime counter, in narrative and provisions.

## D14 — `40-factions.md` §34 (The Sunken Archive) and §26: the two live foreign magical interests

Canon leaves Argonia with **no magical institutions at all** — the hard datum is
that the Synod had "no presence at all for roughly 400 miles" of Lilmoth in the
4E 40s. Both Mages Guild successors should therefore operate through
intermediaries, and each has a distinct, canon-anchored motive:

- **The Synod** — artefact-hunting. Its declared 4E 201 project is locating
  objects of great magical power, in a province full of vakka stones, keystones,
  Zaht stones, Stormhold Crystals, Mnemic Eggs and the Eye of Argonia.
- **The College of Whispers** — **Umbrielic necromancy**. It "had the most
  up-to-date information on Umbriel" and practises necromancy openly. Umbriel's
  dead still lie under the Murkmire mud and in the lower levels of the Rose. A
  College scholar seeking those remains is doing exactly what the College does,
  and from the Argonian side is committing grave desecration on a mass-grave
  scale. **Recommended as the province's most legible foreign magical antagonist**
  — harder to refuse cleanly than the Thalmor, because the motive is scholarly.

**And a free connection**: **Hierem**, the Imperial minister who made the secret
4E 47 trip to Black Marsh and performed the Umbriel ritual at the Lilmoth city
tree, "was a member of the Synod, and reportedly held **vast influence** over it"
(Lore:Synod). Any Argonian who knows this — and the Veiled Reed's records would —
has a permanent reason to refuse the Synod anything.

**Justified by**: [../topics/guilds-and-orders.md](../topics/guilds-and-orders.md) §2.

**APPLIED:** `40-factions.md` §34 premise gains the no-resident-institutions
datum, both motives (Synod artefact-hunting; College Umbrielic necromancy as the
most legible foreign magical antagonist) and the Hierem–Synod connection; SA04
and SA05 sharpened accordingly. See Application notes on the "§26" citation.

## D15 — `40-factions.md` §39 (Blackrose Chainbreakers): retarget

Owner decision Q3: **Blackrose Prison is not a working prison and is not the
state's.** It is a ruin reoccupied by the **Blackguards' heirs** — prison-born
families three generations deep, with Umbriel's undead below and a claim to their
own legitimacy. The plan's "contested institution" framing needs rewording.

What the Chainbreakers oppose instead (see owner Round-2 **Q7**, recommendation A):
**informal bondage** — debt servitude on the ex-Archein estates, tolled crossings
that trap people, indentured dock labour, and the Rose's own prison-born
hierarchy. Diffuse, deniable and much harder to abolish than a building.

**And the better quest canon already wrote**: Argonians who die away from the
Hist, "even in stone prisons **such as White Rose**", can return **if their bones
are brought to the dirt**. White Rose is placed inland in the western burn
country, abandoned and structurally sound, **full of Argonian dead who never got
home**. That is a Chainbreakers objective with more moral weight than a prison
break, and it is `CANON_EXPLICIT`.

**Justified by**: [../topics/prisons.md](../topics/prisons.md);
[settlement-register.md](settlement-register.md) §6.

**APPLIED:** `40-factions.md` §39 rewritten — Chainbreakers now target informal
bondage; BC01–BC04 retargeted (estates, the Rose's registers, a labour broker,
an uprising inside the Rose); new BC05 "Bones to the Dirt" (White Rose); finale
renumbered BC06. Knock-ons: MQ09 (`30-main-quest.md`) reworked around the
Blackguard heirs; LQ04 (`50-side-quests.md`) reworked; NI08 assets note fixed;
`10-political-frame.md` §5 bullet and §9 Blackrose row updated.

## D16 — `20-world-provisions.md`: further locations and systems canon supplies

Additions to the D8 table, from packets 4–6:

| Place / system | Canon | Serves |
|---|---|---|
| **Hissmir's Root Stewards cannot refuse a comer** | They could not bar even a hostile Dominion captain from the Trials | League of Open Water (LW01), Many-Root Conclave |
| **The great Root Talk at Helstrom**, month of Hist-Tsoko | Owner decision Q2; extends the canon Root Talk | Main quest, Many-Root Conclave, Nisswo |
| **Deepmire, "the Refuge"** | Canon shelter of last resort; the workstream sites the province's **Umbriel memorial** here | Umbriel Witness Society; a D4/D5 space that is not the Lost City |
| **Grave-stakes (xul-vaat)** as a province-wide interactable | Each carries the dead one's whole life story; pulling one raises a **bog blight** | Every line — this is the province's signature diegetic system |
| **Wamasu electrify the water around them** | A Nord account: the beast "curs[ed] all the water to deadly convulsions" | Encounter design; swimming systems |
| **Miregaunts return when killed and carry loot with provenance** | "Part of the land"; the midsection cavity may hold a relic "taken in to protect or imprison it" | Fixed-danger guardians, Phase 13 |
| **The wintertide rootworm migration south to Gideon** | Canon-named; red clay marks the stop | Rootworm Waykeepers; seasonal fast travel |
| **Fort Swampmoth**, held but not by the Empire | Canon fort, never located; placed on the Blackwood Road | Border content, Marsh Charter |
| **Cyrodilic Collections, refounded at Gideon** | Its museum was never built | A foreign presence Argonians can argue with rather than fight |

**Justified by**: [settlement-register.md](settlement-register.md);
[../topics/hist-placement.md](../topics/hist-placement.md);
[../topics/ecology-encounters-loot.md](../topics/ecology-encounters-loot.md);
[../topics/guilds-and-orders.md](../topics/guilds-and-orders.md).

**APPLIED (with D8):** merged into `20-world-provisions.md` §12b; the great Root
Talk and White Rose rows also surface in `10-political-frame.md` §9 (Helstrom)
and `40-factions.md` BC05 respectively.

---

## Application notes (2026-08-24, applying agent)

Recorded per the application protocol: places where a delta needed a judgement
call or met something it did not anticipate.

1. **D3 (Black-Tongue beat).** Folded into SS04's claimant list rather than
   added as an eleventh quest row, to respect the deep-line 10–12 quest budget;
   SS08 references it. A standalone Black-Tongue quest remains an obvious wave-2
   extension.
2. **D10.1 (Archon's Ayleid founding).** No quest module actually made the
   contrary claim, so there was nothing to correct; a one-clause note was added
   to the §9 Archon row purely to prevent future error.
3. **D14's "§26" citation.** `30-main-quest.md` §26 (persistent regional
   consequences) never mentions the Synod or College, so there was nothing to
   change there; the §29 incompatibility table already matched. Applied to §34
   and its quest rows only.
4. **D15 (Chainbreaker IDs).** Inserting the White Rose quest mid-line
   renumbered the finale BC05→BC06. Grep confirmed no BC-ID references exist
   outside `40-factions.md`. The line grows 5→6 quests, inside the 4–6 band for
   compact lines in `00-overview.md`.
5. **D2 knock-on left open.** TG10's "Tidal Palace / Crown Ledger" names were
   kept, read as the rebuilt merchant-council seat of the smaller Lilmoth; if
   the world build finds the names too grand for a stilt town, rename at
   Phase 11 authoring — nothing else depends on them.
6. **Q7 tension the deltas did not anticipate.** The main-quest opening (MQ01,
   penal work barge/detail near Alten Corimont) survives all deltas, but under
   owner decision Q7 ("no formal state coercive institution") it should be
   authored at Phase 11 as a *local* arrangement — city debt-and-sentence labour
   of the Stormhold/Alten Corimont kind, i.e. an instance of the informal
   bondage the Chainbreakers oppose — not an arm of a province-wide penal
   system. No quest text currently contradicts this; it constrains future
   authoring only.
