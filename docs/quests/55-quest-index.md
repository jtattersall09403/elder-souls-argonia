# Quest index and the novelty rule

> Module of the quest/narrative master plan (see [README](README.md)).
> **Every agent authoring a new quest reads this file first and updates it in
> the same change.** It exists so that agents working in different regions, at
> different times, with no shared context, do not independently invent the same
> quest — and so that each new quest visibly *adds a piece to the jigsaw*
> rather than filling a hole that is already filled.

## 47a. Why this file exists

Quests are authored packet by packet, by fresh agents. Without a shared view,
three regions will each get a smuggler-with-a-secret and a haunted ruin, and
nobody will notice until playtest. The full briefs live in
[30-main-quest.md](30-main-quest.md), [40-factions.md](40-factions.md) and
[50-side-quests.md](50-side-quests.md); reading all three before writing one
village quest is context bloat. **This file is the cheap summary layer**: one
line per quest, enough to spot a collision, not enough to need maintenance
discipline nobody will keep.

It stays lean by construction: **ID · title · region · shape tags · premise in
one clause.** Nothing else. When quests become machine-readable blueprints at
production stage Q1 ([90-production-sequence.md](90-production-sequence.md)),
this index becomes a generated artifact and stops being hand-maintained.

## 47b. The shape taxonomy

Every quest declares **one primary shape** and up to two secondary shapes. The
taxonomy is deliberately about *premise*, not verb — the verb tags
(`COMBAT`/`DIVE`/`HEIST`…) already exist in [00-overview.md](00-overview.md) §4
and answer a different question.

| Shape | The situation |
|---|---|
| `THEFT` | Something must be taken, or was taken |
| `MURDER` | Someone is dead and the question is who or why |
| `MISSING` | A person, thing or place has vanished; find it |
| `DISPUTE` | Two parties both have a real claim |
| `FRAUD` | Someone is lying at scale — records, trade, faith, insurance |
| `PREDATOR` | A creature or hazard threatens a community |
| `CONTAMINATION` | Disease, blight, poison, bad water, bad sap |
| `SMUGGLING` | Goods or people move where they shouldn't |
| `HAUNTING` | The dead, or something wearing their shape, will not settle |
| `RITE` | A ceremony must happen, or must be stopped, or has gone wrong |
| `SUCCESSION` | Who inherits an office, a name, a debt, a tree |
| `BONDAGE` | Someone is held — an Owing, an indenture, a hierarchy |
| `RECKONING` | An old crime surfaces and someone must answer for it |
| `EXPEDITION` | Reach somewhere dangerous and come back |
| `NEGOTIATION` | A deal, treaty, charter or price must be settled |
| `WONDER` | Something strange, with no faction stakes and no explanation |

## 47c. The novelty rule (binding on every new quest)

Before a brief is written, the authoring agent must:

1. **Scan this index** for the quest's proposed `shape` + `region`.
2. Apply the **collision test** — a proposed quest collides if it shares its
   **primary shape** with an existing quest *and* one of:
   - the same region packet;
   - the same faction line;
   - the same reversal (the twist is the same twist);
   - the same resolution set (the choices offered are the same choices).
3. On collision, do one of: **differentiate** (change the reversal, the
   claimants, the resolution, or the verb), **merge** into the existing quest
   as a stage or variant, or **drop** it and author something the index shows
   is missing.
4. **Declare the brief's `touches` list** (shared NPCs, LOCs, STATEs, items,
   variables — read or write) and check tier direction per
   [40-factions.md](40-factions.md) §30b — a brief may not write anything
   owned by a higher tier.
5. **Add the new row to this index in the same change** as the brief.

Two supporting rules:

- **Shape budget per region packet** *(strong default — a recorded one-line
  reason may depart from it)*: no primary shape may exceed **~20% of a
  packet's briefs**, and never appears in consecutive M/L quests. A packet
  whose briefs are five `DISPUTE`s out of eight is rejected regardless of
  individual quality.
- **Cover the board.** Each packet introduces at least one shape new to that
  region **or draws from the standing coverage-gap list** (end of this file),
  and includes at least one `WONDER`. The gaps in this index are the
  commissioning brief for the next packet — that is the "jigsaw" view.

Validator support is specified in
[80-technical-architecture.md](80-technical-architecture.md) §63.

## 47d. The index

Status: `live` = authored brief exists; `concept` = worked concept awaiting a
packet. Main-quest rows use merged numbering (decision 0026).

### Main quest — *The Eye and the Root*

| ID | Title | Region | Shapes | Premise | Status |
|---|---|---|---|---|---|
| MQ01 | No Name on the Work Roll | Alten Corimont | `BONDAGE`, `RITE` | Owing-gang processing runs into the cult's attack and a dead egg clutch | live |
| MQ03 | A Dead Prisoner's Use | Stormhold | `RECKONING` | Survivors reconstruct the attack; the destroyed roll makes the player useful | live |
| MQ04 | The Tree That Turned Its Face | Shadowfen | `CONTAMINATION` | A Hist withdraws; disease, sabotage and grief overlap | live |
| MQ05 | Helstrom Behind the Thorns | Helstrom | `NEGOTIATION` | Arrival at the safe interior capital, past an empty throne | live |
| MQ06 | The Jewel Nobody Has Seen | Helstrom | `MISSING` | Six incompatible accounts of the Eye, held by unwilling custodians | live |
| MQ07 | The First False Eye | Stormhold | `FRAUD` | A counterfeit Eye at auction hides a real cipher | live |
| MQ08 | The Unbound Root | Shadowfen | `MISSING` | The counterfeit's trail reaches a cult safehouse | live |
| MQ09 | The Map Beneath the Prison | Blackrose | `THEFT` | Confiscation ledgers held by the Rose's prison-born heirs | live |
| MQ10 | The Auction of Drowned Things | Soulrest | `DISPUTE` | Four credible claims on salvage containing the lens-frame | live |
| MQ13 | Pusbottom Remembers | Lilmoth | `THEFT` | A register rubbing already cut out and sold onward | live |
| MQ14 | The City of Two Shores | Archon | `DISPUTE` | A lighthouse map and a smuggler's route disagree | live |
| MQ15 | The Eye Opens Once | Helstrom | `MISSING` | Triangulation — and word of a second withdrawal | live |
| MQ16 | A Key Without a Lock | Coastal Xanmeer | `EXPEDITION` | The Eye recovered from a submerged observatory | live |
| MQ18 | A Sermon Against Roots | Cult sermon house | `RITE` | Infiltration under cover; the Collector unmasked | live |
| MQ20 | Dreams for Sale | Gideon | `RECKONING` | Sap-dream testimony used to classify dissenters; the handler falls | live |
| MQ21 | The Black Sap House | Marsh interior | `CONTAMINATION` | A cult lab forcing a Mnemic Egg out of volunteers | live |
| MQ22 | The Second Report | Helstrom | `FRAUD` | Two incompatible reports, one acted on while you watch | live |
| MQ23 | Marks Only the Eye Can See | Route chains | `EXPEDITION`, `MISSING` | Eye-revealed route, plus the Shadowscale manhunt | live |
| MQ25 | Council Behind Closed Gates | Helstrom | `NEGOTIATION` | The council hearing, attacked mid-session | live |
| MQ26 | The Root of Accord | Helstrom | `RECKONING` | The hidden archive and the Accord's conversion | live |
| MQ27 | The Road No Map Keeps | Helstrom → basin | `EXPEDITION` | Bargain an expedition, then cross D5 country | live |
| MQ29 | The City Beneath the First Rain | Lost City | `EXPEDITION` | The Lost City and the Last Warden | live |
| MQ31 | The Door That Was Promised | Sanctuary | `RITE` | The confrontation and the choice | live |
| MQ32 | Names Written in Sap | Province-wide | `RECKONING` | Modular epilogue | live |

### Faction lines

Rows are the line's spine; see [40-factions.md](40-factions.md) for full briefs.

| ID range | Line | Dominant shapes | Note | Status |
|---|---|---|---|---|
| SS01–SS10 | Shadowscales | `SUCCESSION`, `RECKONING`, `MURDER` | An order with three bidders and no issuing authority | live |
| TG01–TG11 | Night-Reed | `THEFT`, `FRAUD`, `SMUGGLING` | Escalates to the Tidal Palace heist | live |
| FG01–FG10 | Marsh Charter | `PREDATOR`, `FRAUD`, `NEGOTIATION` | Native tradition vs foreign charter | live |
| SA01–SA10 | Sunken Archive | `DISPUTE`, `RECKONING`, `CONTAMINATION` | Ownership of knowledge; foreign interests | live |
| NI01–NI10 | Nisswo | `RITE`, `DISPUTE`, `FRAUD` | Plural belief against dogma | live |
| MR01–MR10 | Many-Root | `SUCCESSION`, `CONTAMINATION`, `DISPUTE` | Consent, ecology, stewardship — discovered in danger, decided in council | live |
| RS01–RS10 | Reed-Sail | `SMUGGLING`, `NEGOTIATION`, `PREDATOR` | Routes, labour and monopoly | live |
| LW01–LW10 | League of Open Water | `DISPUTE`, `FRAUD`, `NEGOTIATION` | Citizenship and property | live |
| BC01–BC06 | Chainbreakers | `BONDAGE`, `RECKONING` | The Owing, audited and burned | live |
| TA01–TA05 | Thorn Ash-Reed | `RECKONING`, `MURDER`, `SUCCESSION` | Border memory and saltrice title | live |
| UW01–UW05 | Umbriel Witness | `RECKONING`, `FRAUD`, `EXPEDITION` | Inherited catastrophe, argued over | live |
| RW01–RW05 | Rootworm Waykeepers | `SMUGGLING`, `NEGOTIATION`, `WONDER` | Sacred routes and access; the worm is never on screen | live |

The **Salt-Teeth arc** lives inside Reed-Sail as its pirate branch
([40-factions.md](40-factions.md) §43); ST05 *Teeth or Tide* is expressed
through RS10's pirate-confederation ending, not a separate quest.

| ID | Title | Home | Shapes | Status |
|---|---|---|---|---|
| ST01 | A Flag with No Ship | Reed-Sail pirate branch (post-RS05) | `THEFT`, `FRAUD` | concept |
| ST02 | The Honest Prize | Reed-Sail pirate branch | `THEFT`, `DISPUTE` | concept |
| ST03 | Mutiny at Low Tide | Reed-Sail pirate branch | `SUCCESSION`, `RECKONING` | concept |
| ST04 | Black Sails at Soulrest | Soulrest (standalone, LQ-class) | `NEGOTIATION`, `SMUGGLING` | concept |

### Standalone and local quests

| ID | Title | Region | Shapes | Status |
|---|---|---|---|---|
| LQ01 | The Causeway That Sinks | Stormhold hinterland | `DISPUTE`, `FRAUD` | live |
| LQ02 | One Boat, Two Funerals | Alten Corimont | `RITE`, `DISPUTE` | live |
| LQ03 | The Crocodile Bell | Managed marsh | `FRAUD`, `PREDATOR` | live |
| LQ04 | The Prisoner Who Stayed | Blackrose | `BONDAGE`, `SUCCESSION` | live |
| LQ05 | Dinner Outside the Walls | Helstrom gate | `PREDATOR`, `NEGOTIATION` | live |
| LQ06 | The City Map That Lies | Helstrom | `FRAUD` | live |
| LQ07 | A Rootworm's Fare | Helstrom transit | `NEGOTIATION` | live |
| LQ08 | The House with Three Floors of Water | Lilmoth | `DISPUTE` | live |
| LQ09 | The Pusbottom Insurance Society | Lilmoth | `FRAUD` | live |
| LQ10 | The Khajiit Flotilla | Soulrest | `THEFT` | live |
| LQ11 | The Honest Pirate | Soulrest coast | `DISPUTE`, `BONDAGE` | live |
| LQ12 | Wamasu Eggs for Sale | Soulrest market | `PREDATOR`, `FRAUD` | live |
| LQ13 | The Estate's Old Door | Gideon | `RECKONING` | live |
| LQ14 | A Shrine for Two Empires | Gideon | `DISPUTE`, `RITE` | live |
| LQ15 | The Bandits Who Count Boats | Gideon→Crossroads trunk | `SMUGGLING`, `PREDATOR` | live |
| LQ16 | The Drowned Testament | Archon | `SUCCESSION`, `DISPUTE` | live |
| LQ17 | The Lighthouse Without a Keeper | Archon coast | `MISSING`, `SMUGGLING` | live |
| LQ18 | A Marriage of Two Shores | Archon | `DISPUTE`, `SUCCESSION` | live |
| LQ19 | The Memorial That Moves | Thorn | `RECKONING` | live |
| LQ20 | The Physician's Family Book | Thorn | `DISPUTE`, `RECKONING` | live |
| LQ21 | The Spear in the Reedbed | Northern marsh | `MURDER` | live |
| LQ22 | The Scholar Who Chose the Marsh | Outer basin | `MISSING`, `EXPEDITION` | live |
| LQ23 | The Underwater Door | Southern wetlands | `SMUGGLING`, `BONDAGE` | live |
| LQ24 | The Healer's Mosquito | Murkmire fringe | `CONTAMINATION`, `FRAUD` | live |
| LQ25 | The River Monster's Rent | Southern river town | `PREDATOR`, `FRAUD` | live |
| LQ26 | The Tree That Heard a Stranger | Minor Hist village | `WONDER`, `DISPUTE` | live |
| LQ27 | A Grave Below the Root | Interior rim | `RECKONING`, `HAUNTING` | live |
| LQ28 | The Last Dry Room | Flooded inn | `DISPUTE`, `CONTAMINATION` | live |
| LQ29 | A Wreck with Living Cargo | Topal coast | `SMUGGLING`, `DISPUTE` | live |
| LQ30 | The Gates of Helstrom | Helstrom | `MISSING`, `RITE` | live |
| LQ31 | The Bonding Feast | Murkmire | `MURDER`, `RITE` | live |
| MQ11 | The Surveyor's Lie *(ex-main)* | Gideon | `FRAUD`, `BONDAGE` | live |
| MQ12 | Ash Written in Water *(ex-main)* | Thorn | `RECKONING`, `DISPUTE` | live |
| MQ19 | The Child of Two Hist *(ex-main)* | Two settlements | `SUCCESSION`, `MISSING` | live |
| DQ01 | The Flu That Prays | Remote community | `CONTAMINATION`, `RITE` | live |
| DQ02 | What the Water Keeps | Drowned Xanmeer | `WONDER`, `NEGOTIATION` | live |
| DQ03 | The Hunt Below the Hunt | Deep marsh | `PREDATOR`, `RECKONING` | live |
| DQ04 | The Door That Bargains | Plantation | `WONDER`, `FRAUD` | live |
| DQ05 | A Shadow With No Star | Village | `MISSING`, `WONDER` | live |
| DQ06 | The Feast of the Patient | D2 route inn | `WONDER`, `RITE` | live |
| DQ07 | The Lover Who Stayed Wet | Coast | `HAUNTING`, `RITE` | live |
| DQ08 | The Mask of the First Speaker | Ruin | `WONDER`, `NEGOTIATION` | live |

### Coverage gaps as of 2026-08-28 — the commissioning brief

Shapes currently thin across the whole plan, and therefore **first call for new
packets**: `HAUNTING` (one primary quest — DQ07 — plus secondaries in LQ27 and
Many-Root's MR05) and `WONDER` (thin outside the Daedric set — every region
owes one). `PREDATOR` is **well covered** — six standalone quests (LQ03, LQ05,
LQ12, LQ15, LQ25, DQ03) plus the Marsh Charter and Reed-Sail lines — and
`SUCCESSION` is carried by the Shadowscale, Many-Root and Thorn lines, ST03
and an Archon pair (LQ16/LQ18); neither is a gap. Regions with no local
quests yet: **Helstrom's basin rim, Blackwood, Middle Argonia, Thornmarsh
east**; Murkmire holds LQ24/LQ31 and Deepmire holds UW04, so their gaps are
depth, not absence.
