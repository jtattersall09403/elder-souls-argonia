# 0039 — Source-game systems cross-check: triage and owner steers

**Date:** 2026-08-30 · **Status:** §1/§2 applied (register updated); **§3
PROPOSED — awaiting owner steers**

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
