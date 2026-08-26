# How Morrowind actually structures its cast — UESP evidence

Mined 2026-08-26 from the UESP MediaWiki API for the quest-plan cast review
(decision 0018 follow-up). Pages: Morrowind:Main Quest, the eight faction pages
(Fighters/Mages/Thieves Guild, Morag Tong, Tribunal Temple, Houses
Hlaalu/Redoran/Telvanni), their `*_Quests` index pages, Morrowind:Camonna Tong,
Morrowind:Caius Cosades. This file is the evidence base for the principles in
[docs/quests/35-cast.md](../quests/35-cast.md) §53 — read that for the rules;
read this only if you need to check them against the source.

## 1. The desk travels nothing — quest-givers are stationary and the player returns

Every faction is a small set of **fixed quest-givers, each at one hall in one
town, each with their own quest list**. Counts from the `*_Quests` pages:

| Faction | Quest-givers (desks) | Quests per desk |
|---|---|---|
| Fighters Guild | Eydis Fire-Eye (Balmora), Lorbumol gro-Aglakh (Vivec), Hrundi (Wolverine Hall), Percius Mercius (Ald'ruhn), Sjoring Hard-Heart (Vivec) | 9 / 6 / 8 / 6 / 2 |
| Mages Guild | Ajira (Balmora), Ranis Athrys (Balmora), Edwinna Elbert (Ald'ruhn), Skink-in-Tree's-Shade (Wolverine Hall), Trebonius (Vivec) | 7 / 6 / 9 / 6 / 2 |
| Thieves Guild | Sugar-Lips Habasi (Balmora), Aengoth (Ald'ruhn), Big Helende (Wolverine Hall), Gentleman Jim Stacey (Vivec, + Bal Molagmer arc) | 6 / 6 / 5 / 6+7 |
| Redoran | Neminda, Athyn Sarethi, Lloros Sarano, Tuveso Beleth (all Ald'ruhn), Theldyn Virith (Ald Velothi), Faral Retheran (Vivec), + councilors ~1 each | 6 / 6 / 4 / 2 / 5 / 6 |
| Hlaalu | Nileno Dorvayn (Balmora), Edryno Arethi, Crassius Curio, Ilmeni Dren (Vivec), Odral Helvi (Caldera), Duke Dren (Ebonheart) | 7 / 8 / 5 / 3 / 5 / 2 |
| Telvanni | 5 Mouths (Sadrith Mora) ~2 each, then the councilors themselves: Aryon (Tel Vos) 10, Therana/Dratha/Neloth 1 each, Baladas 2 |  |
| Morag Tong | any-quest-giver writ pool + Eno Hlaalu (Vivec) 9 | 11 shared + 9 |

Recurrence is produced by **returning to the same desk five to nine times** —
never by an NPC travelling with or after the player. Nobody follows you between
towns. Between-town texture is the *route*, not a face.

## 2. The line's story is the disagreement between its desks

The politics of a faction are carried by its quest-givers disagreeing with each
other, and the finale makes the player resolve it:

- **Fighters Guild**: guildmaster Sjoring Hard-Heart is backed by the Camonna
  Tong; ousted ex-master Percius Mercius opposes him ("bad blood… nobody is
  quite sure which way to turn" — faction page). The line ends in *Remove
  Sjoring's Supporters* / *Kill Hard-Heart* — or, if you worked Sjoring's desk,
  killing the Thieves Guild's leadership instead.
- **Mages Guild**: Ajira's petty feud with Galbedir, Ranis's ruthlessness
  (*Kill Necromancer Tashpi Ashibael* — who isn't one), Edwinna's naive
  scholarship, Trebonius the buffoon Arch-Mage. Working different desks *is*
  learning the institution's ethics; the finale is taking Trebonius's chair.
- **Redoran**: councilor Athyn Sarethi vs Archmaster Bolvyn Venim, resolved by
  a sanctioned duel (*Duel with Bolvyn Venim*).
- **Telvanni**: advancement is literally service to rival councilors, ending in
  deposing/killing Archmagister Gothren.

Each desk also has **a distinct ethic the player samples by working it** — you
learn a line's moral range by which patron you take jobs from, before any
choice is asked of you.

## 3. Cross-faction recurrence = the same conflict from both sides, plus shadow networks. Never travelling friends

There is no recurring friendly face across faction lines. What crosses lines:

- **The same conflict seen from each side**: Eydis's *The Code Book* pits FG
  against TG (and locks TG joining); Sjoring's two quests are *Remove the Heads
  of the Thieves Guild* / *Kill the Master Thief*; Stacey's line answers with
  *Speak With Percius* / *Kill Hard-Heart*. Trebonius orders *Kill the Telvanni
  Councilors*; Aryon counters with *Mages Guild Monopoly*.
- **A shadow network as connective tissue**: the **Camonna Tong** is unjoinable,
  has named members sitting in real taverns, backs Sjoring (FG), is the TG's
  mortal enemy, controls Hlaalu councilors through **Orvas Dren**, and Dren
  sympathised with House Dagoth (main quest). One spider, four webs, met from
  four different angles.
- **Co-location**: Balmora alone contains Caius, Eydis, Ajira+Ranis, Habasi,
  Nileno Dorvayn and the Council Club Camonna Tong. Casts overlap because the
  *city* is shared, not because people move.
- **Cheap cross-links through opinion**: Caius, asked about the Fighters Guild,
  "knows and trusts Percius, and doesn't know Eydis very well". One dialogue
  line, no scheduling.

## 4. The main quest is a relay, and the handler is removed

Caius Cosades: one desk in Balmora; vivid cover-as-character (the skooma
"problem" that is also real); sends the player to **informants used once or
twice each** (Hasphat Antabolis, Sharn gra-Muzgob, the Vivec informants,
Zainsubani), who hand the player onward. The middle act hands the player to
*institutions* — three Great Houses and four Ashlander camps, each with its own
local cast — and the endgame to the summit figures (Vivec, Dagoth Ur).

**Caius is recalled to the Imperial City after *Mehra Milo and the Lost
Prophecies* and permanently disappears from the game** — the handler is written
out at the midpoint, forcing independence exactly when the player is ready for
it. Also: high level + reputation lets the player skip the Hortator/Nerevarine
recognition circuit, and the Yagrum Bagarn "back path" tolerates a broken main
quest — the structure bends rather than blocks.

## 5. Depth is budgeted by rank and act; strangeness is localised

Early desks are vivid but simple (Ajira's mushroom feud). The deep, strange
characters — Divayth Fyr and his clone daughters, Yagrum Bagarn the last
Dwemer, Vivec, Dagoth Ur (who greets the player courteously and offers a job) —
are all **gated behind mid/late game**. Big personalities are *localised*, one
per place (Crassius Curio demands a kiss and a poem; Therana's senility is one
quest at Tel Branora). Councilors mostly give one quest each: the game has a
huge named cast with tiny per-NPC quest counts, and saves its production depth
for the desks.

## 6. Single-use characters are named and vivid; nicknames do heavy lifting

Faction lines touch 15–40 named NPCs each (targets, victims, contacts), almost
all single-use, almost all with one memorable handle: Tongue-Toad, New-Shoes
Bragor, the Mad Lord of Milk, Fast Eddie, Only-He-Stands-There. In Imperial and
underworld circles the *nickname is the characterisation* (Gentleman Jim
Stacey, Sugar-Lips Habasi, Big Helende, Sjoring Hard-Heart, Yngling
Half-Troll). Quest names themselves carry flavour (*Naughty Gandosa*,
*Withershins*, *The Bitter Cup*).

## What this means for us — deltas applied to 35-cast.md

1. **Replace "cross-line faces" with desks, co-location and shadow networks.**
   No character travels between lines to be recognised; instead, fixed figures
   sit where multiple lines happen to go, factions collide over the same
   conflict from both sides, and one or two unjoinable shadow networks (the
   ex-Archein **Owing brokerage** as our Camonna Tong; the Unbound Root as the
   whispered one) connect everything.
2. **Replace the relationship-type quota with the Morrowind faction shape**:
   3–5 stationary patrons distributed over the line's settlements, each with a
   distinct ethic, at least one pair in live disagreement, a mid-line moment
   where the player must pick a desk, and a finale that resolves the
   disagreement.
3. **Keep** depth tiers, contradiction+quirk, the naming-form spread (the
   nickname evidence strengthens it), the cliché budget, oddities, voice
   sheets — all of these have direct Morrowind counterparts.
4. **Main quest**: the relay shape (handler → single-use informants →
   institutions → summit figures) and the **handler-removal beat** are worth
   adopting; flagged to the owner rather than applied, pending the main-quest
   review.
