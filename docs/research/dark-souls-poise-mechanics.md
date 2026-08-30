# Dark Souls poise — implementation-level mechanics (DS1, with DS3/ER deltas)

Research for module 76 §121.3 (poise reinstated, owner round 4, decision 0037).
Sources: darksouls.wikidot.com/poise (primary, rev 138), fextralife DS1/DS3/ER
poise pages, community mechanics threads. Fetched 2026-08-30.

## DS1 — the model we adopt

**The pool.** Poise is a hidden numeric pool; players AND enemies have one.
Each incoming hit subtracts that attack's fixed poise-damage value (completely
independent of HP damage; weapon buffs/resins do NOT raise it). If the pool
reaches 0 after a hit → stagger. Having >0 left = no stagger at all (no
flinch, action uninterrupted).

**No steady regen — instant refill on a timer.** Poise freezes at its last
value (53 hit for 20 → sits at 33). Each hit restarts a hidden timer; when it
completes without another hit, poise refills instantly to 100 %. Player base
timer 5.0 s; each equipped poise-granting armour piece cuts it 10 %
multiplicatively (4 pieces → 3.28 s). Enemies: 5.0 s almost universally
(Artorias 2.5 s, Chained Prisoner 4.0 s). Phantom hits (connecting during roll
i-frames) still drain poise and reset the timer.

**Max poise sources**: worn armour pieces sum linearly (Havel's set 121);
Wolf Ring +40 flat; Iron Flesh pyromancy and Havel's Greatshield buff
(mutually exclusive). No stat or level contributes in DS1 — equipment/buffs
only. (Our design diverges here: base poise = Agility/2, re-housing
Morrowind's knockdown threshold.)

**Attacker side**: poise damage = weapon-class base × attack-type factor.
- Class bases: dagger/thrusting sword **5** · straight sword/katana/spear/
  curved sword/whip/light halberd/fist weapons **20** · greatsword/curved GS/
  battle-axe/mace tier **35** · ultra GS/greataxe/great hammer **50**.
- Factors: 1H light ×1.0 · 2H light ×1.5 · 1H backstep/running ×1.1 ·
  2H backstep/running ×1.6 · jumping ≈×1.5 · R2s per-weapon (commonly ×1.2).
- Spells carry their own values (Soul Arrow 20, Soul Spear 80, Fireball 40,
  Great Fireball 80, Sunlight Spear 120, storm spells 90–120/column).
- Arrows/bolts 20 (Dragonslayer 60); **headshots = guaranteed stagger
  regardless of poise**; kicks = guaranteed stun on players + ~20–35 poise.

**Breakpoints** (survive one hit of X): 6 (1H dagger) · 21 (1H of 20-base) ·
31/32 (2H/running of 20-base — the PvP meta) · 36 (1H 35-base) · 53/56
(2H 35-base) · **61** (two 30s or three 20s) · 76 (any single light attack in
the game) · 81 (Great Fireball).

**On break**: stagger animation (loses control briefly; stun-lockable), pool
back to full for the next exchange; excess poise damage does not carry over.
Some attacks ignore poise entirely (kicks, headshots, WotG-family AoE).

**Enemies**: same system. Basic hollows 0; Silver Knight 45; Darkwraith 65;
Black Knight 80; Taurus-tier 100–120; Titanite Demon 200. Bosses: Gargoyles
80, Ornstein 90, Gwyn 100, Smough 110, Artorias 130 — and many big bosses
have no poise and are flagged unstaggerable (Kalameet, Nito, Manus, Seath,
Sif, Four Kings…). That flag is our `staggerable: false`.

## DS3 — hyperarmour-only (what we are NOT doing)

Armour poise stops being passive stagger resistance: at neutral you stagger on
any hit regardless of poise. A hidden poise-health pool (regenerating only to
80 %) is consulted **only during hyperarmour frames** on heavy-weapon attacks;
the armour poise stat becomes a % reduction on incoming poise damage inside
those windows. Poise = an attack-trading stat for big weapons, worthless
passively. (At launch it looked non-functional; patched at 1.08.)

## Elden Ring — passive poise returns, hybridised

Armour + talismans sum to a visible poise stat mirrored by a hidden bar; any
hit drains it any time; at 0 → stagger and reset to full, no overflow. Deltas
from DS1: refill is ~30 s for players (enemies ~6–15 s), poise-damage numbers
are much larger (dagger ~40, colossal ~500), and hyperarmour is layered on top
(heavy attacks/skills multiply your effective poise mid-swing). Breakpoints:
51 (survive standard lights), 101. The yellow stance-break meter on enemies is
a separate system.

## Design-space summary

DS1 = always-on passive pool, short (3.3–5 s) instant-refill timer,
breakpoint-driven buildcraft. DS3 = pool consulted only in per-attack
hyperarmour windows. ER = passive pool again, slow refill, hyperarmour on
top. Module 76 §121.3 adopts DS1 (matches our armour-skill banding and needs
no per-attack window authoring), with base poise from Agility as the
Morrowind graft. Hyperarmour on heavy attacks is the one ER/DS3 idea worth
revisiting at 10c if heavy weapons feel weak in trades.
