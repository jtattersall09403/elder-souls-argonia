# 0039 — Source-game systems cross-check: triage and owner steers

**Date:** 2026-08-30 · **Status:** **CLOSED** — owner ruled on all steers
same day (see "Rulings" below); one item open (pilgrimage circuits, pending
explanation).

## Rulings (owner, 2026-08-30) — these supersede the proposals below

- **Ownership, corrected and narrowed (Morrowind-visibility model):** the
  `owner` slot is optional — wilderness/unowned objects are the norm outside
  settlements and taking them is never theft. **A theft bounty exists only
  if the act is witnessed** (the taker is *detected* by someone during the
  taking). **No stolen flag on possessed items, ever**: once you have it,
  no NPC or merchant can tell where it came from — explicitly NOT
  Oblivion/Skyrim fencing. CUT from the adopted set: stolen-flag runtime,
  lawful-merchant refusal, launder-through-a-fence mechanics; the
  evidence-chest confiscation loop survives only for goods a witness record
  ties to a crime, else drop it. *Consistency note for the quest docs:* the
  Reed track's "finite stocked fence" (30 §24b, 0028) is hereby flavour —
  a no-questions buyer and contraband outlet, not a laundering mechanic.
- **S1 traversal magic: KEEP ALL the Morrowind families** — levitation
  ("one of the most fun bits of the whole game"), water walking, Mark/
  Recall, telekinesis, Open, Detect. Intervention = **shrine networks,
  yes**. Constraint: flavour must be **race-neutral** — nothing load-bearing
  may assume an Argonian player (so plain Mark/Recall spells, not
  Hist-communion-gated Recall). Phase 12 dungeon/underwater design must
  account for levitation existing (Morrowind's own tools: cost, duration,
  slow speed, magicka economy, Dispel).
- **S2 survival: NEITHER — cut.** "This isn't a survival game." Danger
  comes from encounter frequency/difficulty, diseased creatures, venom —
  not atmospheric attrition. No hunger/heat/wet layer, no survival item
  field at 10c, and the module 30 §26 "hazard-preparation goods loop" is
  closed: counterplay = the normal cure/resist alchemy and effect economy.
  Guide services stay (travel/economy flavour, not survival).
- **S3 rest & inns: YES, strengthened** — wait/rest verb split; **no
  camping inside settlements** (wait only; resting in town needs an owned/
  rented bed); bed-quality tiers, calibrated at 10c. Module 76 §126 amended
  in this change.
- **S4: no corprus-style chronic condition.** Hist-site communion powers:
  **open design slot** — owner is receptive *if* a design is sensible, fun,
  simple, reuses existing systems (powers semantics + effect stack), adds
  little complexity, and respects race-neutral completability (an Argonian
  advantage is fine; a race-gated progression path is not). Design at
  magicka round 2 / build-out planning; not a commitment.
- **S5 customs/standing: YES** — adopted as proposed.
- **S6: bleedout CUT** — story-essential NPCs get **no extra protection**;
  the doom-warning message + reload remains the whole model (reconfirms
  0030). H2H fatigue-drain knockout shape: **YES**.
- **S7 reprisals: YES.** And confirmed: **the Owing ledger is per-city/
  region** — a bounty in Gideon doesn't follow you to Lilmoth; where an
  uncleared bounty exists, guards stop you and the already-designed
  resolution verbs (pay/audit/buy-out/resist arrest…) apply.
- **Veto list outcomes:** CUT — generic killmove/finisher layer, projectile
  interception, requestable tavern musicians. **Fishing: yes, conditional**
  on the animations being a cheap sourcing job (vanilla Skyrim pre-AE has
  none — check the vault/mod scene before adopting; drop if expensive).
  Adopted unopposed: rest-quality tiers (S3), contraband/cursed-offering/
  attire-signal/donation flags, creature merchants, tavern brawls not
  requested — dropped with the killmove layer... (brawls were optional;
  treat as dropped unless a quest brief wants one). **Pilgrimage circuits:
  owner asked what they are — OPEN, answer pending** (a Morrowind
  Seven-Graces-style chain of shrine visits with small rituals/blessings
  forming a province-spanning sightseeing quest line).

---

**Original proposal record below (superseded where the rulings differ).**

## Context

Owner commissioned a UESP-mined audit of Morrowind's and Skyrim's game
systems to complete the build-out picture (DS1 was already covered by
workstream S), triaged three ways: (a) adopt, (b) cut on prior rulings,
(c) owner steers. Evidence:
[research/source-game-systems-crosscheck.md](../research/source-game-systems-crosscheck.md).

## Applied

- **Adopted (§1 of the cross-check):** ~22 systems/details recorded in the
  register with hooks — headline items: item **ownership on every placed
  ref** (Phase 11 schema hook), crafting **stations** + `STATION` sockets,
  Fight/Flee/Alarm + 72-h Owing amnesty, deed counters (`deedCountAtLeast`),
  player-state overlay machinery, faction reaction matrix, creature
  statblock class (which resolves the Argonian-soul question: NPC souls are
  simply untrappable), encounter templates, courier channel, shrine
  blessings, staged disease with the hazard-goods loop, diegetic
  chargen/tutorial template, dungeon anchor sockets, contraband/cursed/
  donation/attire-signal flags, urban water taxis.
- **Cut (§2), each with its citing ruling:** player vampirism/lycanthropy
  and Hearthfire-style player construction (owner, 2026-08-30 — Nisswo
  vampire stays as content; steward pay-for-service pattern retained),
  shouts, swappable birthstones, apex roaming threat, marriage/adoption.

## §3 — The owner steers (PROPOSED, answer in any order; none block Phase 10)

S1. **Teleport + traversal magic** — the big one, **gates Phase 12 dungeon
    design and the magicka-round-2 batch**. Does Argonia have: Mark/Recall
    (→ Hist-anchor communion?), Intervention-style shrine escapes,
    **levitation** (collides with BotW climbing + dungeon verticality —
    recommend CUT), water walking, telekinesis/Open magic, Detect spells
    (a sanctioned "help me find it" in a no-marker game — recommend KEEP)?
    Recommended shape: a limited, Argonian-flavoured set — but each effect
    needs a ruling.
S2. **Survival/attrition depth** — wetland survival (heat/wet/insects/fever
    caps, toggleable) vs just the hazard-prep goods loop (recommended) vs
    none. Either way 10c should ship the item-schema field (warmth →
    `insectResist`/`dryness`) — cheap now, retrofit later.
S3. **Rest & inn economy** — "camp anywhere calm" is your S-round-1 ruling
    and stands; do we enrich it with the wait/rest verb split and
    bed-quality tiers so inns and the stronghold bed matter? (Recommend a
    light version: tiers, no hunger.)
S4. **An Argonian condition/powers thread** — vampirism is out; do we want
    its *shape* reskinned: a corprus-style chronic condition in the main
    quest, and/or Hist-site communion powers (the Word-Wall analogue) as
    the mechanical payoff of hero sites? This would also settle the
    "Hist systemic layer" ambition from audit §4.
S5. **Civic standing + customs/etiquette** — per-settlement custom rules
    (taboo/etiquette violations cost standing, not bounty), a capped
    outsider-standing track (Clanfriend model), and a favours ladder with
    relationship ranks. Recommend YES for a tribal province; it gives the
    unowned "per-culture taboo" ambition its mechanic.
S6. **Non-lethal combat states** — bleedout for tier-protected NPCs
    (recommend YES: squares "all NPCs killable, no invincibility" with
    quest survivability), the Morrowind H2H fatigue-takedown shape for the
    decided knockout finisher (recommend YES), tavern brawls (optional).
S7. **Reprisal events** — Owing enforcers / hired thugs that find you
    (courier-delivered, escalating with debt/notoriety), including
    interrupt-on-rest attacks that can be traced back and shut down as
    content. Recommend YES — it gives the crime system teeth and makes
    load-bearing rest conditionally unsafe.

**Default-adopt veto list** (small, cheap, aligned — going in unless the
owner objects): fishing spots · generic killmove finisher layer (vault clips)
· projectile interception · requestable tavern performers · pilgrimage
circuits (answers the festivals ambition) · rest-quality tiers (ties to S3)
· contraband, cursed-offering, artifact-donation, attire-signal flags ·
creature merchants.
