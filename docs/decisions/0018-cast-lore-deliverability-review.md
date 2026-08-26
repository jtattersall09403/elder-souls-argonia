# 0018 — Quest-plan review: cast, lore, deliverability and fun

**Date:** 2026-08-25 · **Status:** accepted · **Scope:** `docs/quests/`,
`world/sources/lore/topics/labour-and-bondage.md`

Owner-commissioned review of the whole quest plan on four axes: characters, a
second lore pass, scripting complexity, and whether any of it is boring. What
follows is what changed and why; the *content* lives in the modules, not here.

## 1. Characters — the plan was staffed, not populated

**Finding.** Across ~90 faction quests almost nobody was named; the player met "a
dying contract-killer", "a respected labour broker", "a scholar". Seven of nine
principals shared one name construction (Verb-the-Noun) and three used the same
reed/root/water imagery. Nobody in the cast was young, funny, physically
distinctive, non-Argonian, or wrong in a way a player could sympathise with. The
wonder budget covered strange places and no strange people. Nothing prevented two
lines from independently authoring the same person.

**Decision.** New module **[35-cast.md](../quests/35-cast.md)**, mandatory before
naming any NPC. It carries: C1–C4 depth tiers (depth proportionate to
discoverability); six character rules (contradiction *and* quirk; one quirk only;
a cliché budget of one flagged stock type per line with a declared subversion and
none in the principal cast; a requirement that some antagonists be right and some
allies wrong; a ten-type relationship taxonomy with a four-types-per-line minimum;
and a recurring-face rule); a **canon-grounded naming system** of five forms (Jel,
translated Tamrielic, nickname, chosen, foreign-inflected) in which the form a
character carries *is* political information; the rewritten principal cast; a
named recurring cast for all twelve faction lines; six cross-line faces; a
canon-sourced oddities roster; and a texture kit for C4s built from the
material-culture dossier.

Three new principals were added to fix cast-level gaps: **Never-Writes-Twice**
(the honest hardliner — the player's most dangerous enemy is the only person in
the service who does not lie), **Spills-The-Ink** (a young clerk who becomes what
the player models, with no choice menu), and **Ahnjazzi** (a Khajiit marine
underwriter — the cast's only non-Argonian, and a diegetic danger-tier oracle).
Two principals were renamed to break the imagery collisions
(*Speaks-in-Reeds* → **Ei-Tuja**, *Moss-Beneath-Stars* → **Kaska-Meen**).

## 2. Lore pass — three canon assets were sitting unused, and one gap was open

**The Owing.** The Chainbreakers fought "informal bondage", which is real but
shapeless. Canon supplies the components of a specific institution: penal labour
for privileges is attested *in this province* (Stormhold's "Tunnel Rats" dug for
crystals "in return for limited freedom"); owed labour is already a listed medium
of exchange inland; the Archeins' post-secession fate is an explicitly open canon
gap; toll-taking is the normal form of rural revenue; and the province has no
courts, no treasury and no state prisons. New dossier
`world/sources/lore/topics/labour-and-bondage.md` joins them into **the Owing** — a
sentence counted in *nushmeekos* (the canon month of thankless work), native and
humane in origin, drifted into transferable, extendable, effectively heritable
bondage wherever assessment fell to whoever holds the crossing. Its tell is free
and canon: *gloor* means traits fade with distance from one's Hist, so anyone held
long in an Owing is **visibly washed out** — one material variant makes the
injustice legible across a dock. And because souls return to the Hist, the
Chainbreakers' burial work and their abolition work are the same work.

**The Mnemic Egg.** The Unbinding was a project-original ritual. Canon already has
the exact tool — a dead Hist's memories in a seed, "in the wrong hands a tool for
severing the Argonian–Hist connection", used by the Dominion in 2E 582 to stop a
generation of eggs hatching. Grounding the cult's method on it makes the
"withdrawals" of MQ04/MQ15 **harvest attempts**, gives Act III a physical object to
fight over, and makes the Veiled Reed's foreign-hands paranoia justified rather
than merely institutional.

**Hierem.** Canon: the Imperial minister who set Umbriel in motion was the Synod's
most influential patron. That was being spent in the Sunken Archive line, where it
is worth little. Moved to the main quest: the Reed's most classified file is 150
years old and about a foreigner, and it is the only document that justifies the
Director's office.

**Two premises re-anchored.** The Marsh Charter no longer "traces legitimacy to
the Fighters Guild" — canon says that charter died with Imperial authority and its
function was absorbed by the **Four Winds of Stonewastes**, shellback levies and
tribal *kaals*, so the line's conflict is now whether a native tradition should
accept a foreign form. The Sunken Archive is no longer staffed with robed mages —
canon says magic here is folk literacy, not a profession, and every magical
institution in the province was foreign-founded and none took root; the line's
spine is now the canon **Conclave of Baal at Stormhold**.

**Tone correction.** The Unbound Root is now criticised *in Argonian terms* by the
Nisswo: severance is **shunatei** — holding on to an injury so tightly you would
destroy the thing that caused it. Required, because the lore is explicit that a
cult treating Sithis as capital-E Evil breaks the setting.

## 3. Deliverability — scripting complexity is now a declared constraint

**Finding.** The plan contained a rooftop-and-canal foot chase (LW04), a
"staged pursuit path" (MQ24, SS07), boat-versus-boat pursuit (TA02), storm rescue
of distressed vessels (RS07), an escorted D5 expedition (MQ27–28), protect-the-NPC
combat inside a council scene (MQ25), a simulated camp riot (MQ02), and two
escorts hidden as side quests (LQ05, LQ30). Every one of these is a known bad
scripting pattern — the escort/fleeing-NPC bug class recurs across shipped
AAA games because it is a property of the pattern, not of any one team.

**Decision.** Every quest declares a **delivery tier** alongside its cost tier:
D-A static (~55%), D-B one bounded dynamic element (~35%), D-C bespoke (~10%, ≤1
per line, always with a D-B fallback authored alongside). [00-overview.md](../quests/00-overview.md)
§4 carries a cheap-pattern library and a **conversion table** — pursuit by
inference instead of a fleeing NPC; the guide leads on a waypoint leash instead of
being escorted; fight in an adjoining cleared chamber instead of protecting NPCs
in a crowd; fixed splines instead of vehicle AI; a corridor of authored pockets
instead of a simulated riot; two or three static configurations instead of
anything that moves (the accepted TG04 fix, generalised). All nine offending
beats above were converted in place, and the world-provision contract now requires
the world to *make the cheap patterns possible* (static intercepts, readable
trails, retreat geometry).

Explicitly: none of these conversions reduces the excitement. Most increase it —
"read which of three exits he took, then be there first" is a better scene than
"hold forward behind a running man".

## 4. Fun — the boredom test

**Finding.** Roughly a dozen quests were read-and-talk with no physical or
interpretive spine (MQ06 an archive and a debate; MQ11 a manor and records; MQ12 a
hearing; MQ19 two settlements and a hearing hut; NI02 "observe community
practice"), the Thorn line ran five consecutive commemoration quests, the Umbriel
line was five archives, and Act II's six-lead structure is the plan's biggest
structural monotony risk.

**Decision.** A **boredom test** in [00-overview.md](../quests/00-overview.md) §4:
in an S-tier quest the *quest-giver* is the payload; every quest carries at least
one reversal; no bare collection objectives; conflict may be internal, political,
ecological, spiritual, economic or procedural but a wholly procedural quest must
be short and have a memorable person in it; reward with the world rather than with
gold; and vary the verb across a run. Applied: the flagged quests were rewritten
(MQ06's accounts are in unwilling hands and one of them is a song; MQ11's answer
is out on the road that is not on the map; MQ12 is a dive; MQ19's subject has
already gone; NI02 is participation not observation), the Thorn line gained the
saltrice title question, the Umbriel line gained Deepmire as a D4 spike, and
[30-main-quest.md](../quests/30-main-quest.md) §21b binds Act II to one verb per
lead, one lead that costs something, and one lead that is a forgery.

## What this does not change

Frozen decisions, the five ending families, the danger geography, the content
targets, the S/M/L cost tiers, the world-generation exit gate, and the production
sequence are untouched. Owner decisions Q1–Q5 and Q7 remain binding; the Owing is
the *content* of the "informal bondage" Q7 already established.

## Addendum 2026-08-26 — cast model realigned to Morrowind's actual structure

Owner directive: infer Morrowind's cast principles from UESP and use those.
Findings recorded in `docs/research/morrowind-cast-structure.md` (desks not
companions; the line's story is the disagreement between its desks; nothing
friendly recurs across lines — shared places, both-sides conflicts and shadow
networks do; the main quest is a relay whose handler is removed mid-game;
single-use characters get a handle, not a history). Applied: 35-cast.md §53.5
replaced the relationship-type quota with the desk shape (3–5 fixed posts,
distinct ethics, one live argument, mid-line pick-a-desk, finale resolves it);
§57 "cross-line faces" replaced by shared places + declared collisions + shadow
networks, with **the Owing brokerage under Oleen-Tei ("Tibus Oleen") as our
Camonna Tong**; every §56 line block now declares its desks and its argument;
travelling figures fixed to posts (Ahnjazzi → Soulrest, Pell → Gideon, Ki-Ossa
→ Helstrom terminus; Hana-Vei and Grave-Singer Ossu keep canon-grounded
itinerancy scoped to their own lines). Validators and acceptance criteria 28–29
updated to match. The Caius-style handler-removal beat is flagged for the
main-quest review, not yet applied.
