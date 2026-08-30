# Source-game systems cross-check: Morrowind + Skyrim (2026-08-30)

Companion to the [build-out systems audit](game-buildout-systems-audit.md).
Two Opus agents swept UESP (MediaWiki API, ~125 pages: Morrowind/Tribunal/
Bloodmoon gameplay index + the 300-effect magic category; Skyrim's five real
gameplay categories) and diffed each game's *systems* against our audit +
register. **Dark Souls 1 needs no sweep** — workstream S audited its
mechanics directly (poise, i-frames, equip load, bonfire analysis; decisions
0031–0037). All findings triaged per the owner's scheme (decision
[0039](../decisions/0039-source-game-crosscheck-triage.md)):
**§1 adopted** (needed/wanted — follows from decided systems), **§2 cut**
(collides with a recorded ruling), **§3 owner steers**. Citations are UESP
page names.

**The Morrowind headline:** our docs port Morrowind's *character* machinery
well; the blind spot was its **world-interaction layer** — the magical
travel network, ownership/notoriety/provocation, per-actor reaction values,
and player-condition overlays. **The Skyrim headline:** several systems are
half-free because our asset vault already contains their meshes *and*
use-animations (crafting stations, furniture markers, killmove clips).

---

## 1. ADOPTED — recorded in the register; hooks named

| System | Source | What we adopt | Owner / hook |
|---|---|---|---|
| **Item ownership** as a first-class property | MW *Crime*; Sky *Crime* | `owner` (npc\|faction\|none) + value tier on every placed interactable; stolen flag persists, blocks lawful merchants, confiscated to a **burglable evidence chest** (fine→heist loop); **books readable in place, only Take is theft**; trespass = unlocking, not entering | **Phase 11/12/13 placement schema — retrofit is the expensive version**; register row |
| **Crime counterplay** | MW *Crime*, *Disposition*, *Morag Tong* | self-defence rule (provoked-first ≠ crime), Taunt/Frenzy provocation verbs, notoriety tiers changing world default behaviour, custody cost paid in **skill/vastei progress** (non-monetary), **writ item class** (sanctioned kill clears the ledger — Shadowscales are canon), attire-hatelist flags, **72-hour decay/amnesty rule for the Owing ledger** | crime/Owing register row (design details); amnesty = a required decay rule, currently absent |
| **Fight / Flee / Alarm** per-actor triple | MW *NPCs* | three 0–100 ints unify aggression bands, morale/flee, ranged-caster switch, and bystander crime response; disposition- and distance-modified | NPC schema hook at 10b/10c (with the Spot stats) |
| **Deed counters / silent unlocks** (Twin Lamps model) | MW *Slavery*, *Factions* | invisible accumulating-deed counters that unlock topics/passphrases/factions with **no journal entry** — the ideal no-quest-marker reward shape; + the unpickable lock class w/ spell-as-alternate-key | `deedCountAtLeast` in the Q1 condition vocabulary; lock class in trap/lock design |
| **Player-state overlay machinery** (not the vampire content) | MW *Vampires* | one flag class that globally gates services, transport, topics and disposition — the generalisation of `washed-out`, disguise, blight, cult marks | condition vocabulary + service-gating contract |
| **Faction reaction matrix** | MW *Factions*, *Transport* | inter-faction reaction data → computed disposition term ×(1+rank/2), **worst-reaction-wins** across memberships, and **allegiance may remove services** (the recorded reward-track trade-off philosophy, mirrored) | factions row; data feeds 76 §125 |
| **Creature vs NPC class split** | MW *Combat*, *Souls*, *Disposition* | simplified 3-skill creature statblock (a real 10c scaling win), creatures have no disposition (→ **creature merchants** trade flat — a perfect Black Marsh oddity), **NPC souls untrappable** — which resolves our open "Argonian souls return to the Hist" question as the general rule, not an exception | 10b/10c actor schema + soul-trappability flag |
| **Crafting stations as world objects** | Sky *Forge/Grindstone/Workbench/Tanning/Smelting/Cooking* | station family whose meshes + use-animations are already in the vault; gives 10c's repair/temper/brew math a diegetic home; NPCs use them as schedule marks | `STATION` socket type in Phase 11/12 vocabulary; register row |
| **Container respawn + safe storage policy** | Sky *Containers*, *Respawning* | explicit reset classes (respawning vs safe), flora regrowth, where the player parks gear (stronghold/home/camp) | 13/14 data + save row |
| **Harvest/resource nodes** | Sky *Mining* etc.; 75 §56 HarvestSocket | ingredient picking + Argonian industry nodes (reeds, clay, hides via the pelts→tanning→leather chain feeding smithing/cooking) | 13 ecology feed + stations row |
| **Encounter templates** (World Interactions) | Sky *World Interactions* | ~fixed spawn points with authored template classes (reactive/beneficial/hostile/differing-outcome) — the answer to empty roads; **distinct from the radiant-quest cut** | Phase 13 content class + packet placement |
| **Courier / letter channel** | Sky *Courier* | a generic carrier that finds the player: the cheapest content unit in a text-led game and the only push channel for far-away world state; also carries reprisal notes | register row (attach to quest-engine + crime rows) |
| **Furniture & interaction markers** | Sky *Sleeping*, *Milling* | beds/chairs/lean spots/station markers consumed by NPC schedules and the player; what makes settlements read inhabited | ambient-AI row hook; assets in vault |
| **Shrine blessings** | Sky *Blessings*; MW *Shrines* | activator → one temporary buff slot + cure services; **priced by faith standing** (free at rank), item-offering variants; the MEND ending's promised "clean blessing" needs exactly this | economy row + effect stack |
| **Staged regional disease** | MW *The Blight*, *Diseases*; Sky *Diseases* | common/blight-style tiers with distinct cures, **caught from variant creatures, not the air**, native protective garments, shrine/potion safety net — gives the ownerless hazard-prep goods loop (30 §26) its closed shape | 13 + 10c effect stack; economy row stocks the counterplay |
| **Diegetic chargen + tutorial-by-touch** | MW *Character Creation* | the class-quiz pattern (in-fiction questionnaire → inferred build; a natural Nisswo naming-rite) and verbs taught by picking objects up — the proven template for the homeless **vastei tutorial** | chargen row; the packet owning the opening |
| **Contraband flag** | MW *Crime* §Contraband | banned goods gate *commerce* (merchants refuse Barter), not law; per-merchant tolerance; canon-adjacent (Hist sap, moon-sugar routes) | one item flag on the economy row |
| **Cursed offerings** | MW *Cursed Items* | shrine loot indistinguishable from normal; taking it triggers the guardian — taboo taught by punishment | loot/trap compiler semantic (13) |
| **Artifact donation sink** | Trib *Museum of Artifacts* | convert a unique into standing/prestige instead of gold — the inverse trade "gold is the least interesting reward" wants | reward-tracks/economy row |
| **Dungeon anchor sockets** | Sky *Dungeons* | Boss / Boss-Chest / Captive anchors in every dungeon so later quests bind generically | Phase 12 socket vocabulary (near-free now) |
| **Urban water-taxi tier** | MW *Transport* (gondoliers) | canton-style intra-city ferries for waterborne settlements — nominal fare, talk-pay-arrive | Phase 11 travel graph (city-internal edges) |
| **Attire as faction signal** | Sky *Crime* §Guard Dialogue | `factionSignal` tag on equipment; ordinary NPCs react; generalises MR04's one-off disguise flag | item schema + factions row |

## 2. CUT — collides with a recorded ruling (citation per cut)

- **Player vampirism & lycanthropy** — owner ruling 2026-08-30 ("I don't
  think we need werewolves or vampirism"); huge condition systems; the canon
  Nisswo vampire (quests 40 NI05) stays as *content*, needing no player
  system. The overlay *machinery* is adopted (§1).
- **Shouts / thu'um** — Skyrim-specific lore with no Black Marsh basis; we
  have no VO (quests 00 §1); nothing in our design references it.
- **Hearthfire / Raven Rock player construction** — owner ruling 2026-08-30;
  the stronghold stays the authored 3-layer + 4-overlay compositor (30
  §24b.5, 0028). Retained detail: the **steward pattern** (pay gold → site
  gains a service/route) folds into the reward tracks.
- **Swappable standing stones** — birthsigns are chargen-fixed in the
  accepted S design (76 §119); Morrowind-souled, birth means birth.
- **Apex roaming threat (dragon analogue)** — fights the fixed-regional-
  danger identity (0004) and the province-simulation caps (quests 20 §14);
  the rootworm is permanently never-seen (0030).
- **Marriage / adoption / children / pets** — companion-adjacent domestic
  systems; companions are a hard cut (30 §24b.3, 0028). Residue (spouse
  income timer) already exists as "income timers".
- **Reconfirmed existing cuts** the sweeps touched: perks, radiant *quest
  generation*, level scaling, dice, haggle minigame, pickpocket, crossbows/
  thrown, estus, moveset unlocks, companions, full VO, multiplayer.

## 3. OWNER STEERS — see decision 0039 (PROPOSED; the questions live there)

Seven genuine forks (teleport/traversal magic incl. levitation; survival
layer depth; rest/inn economy; an Argonian chronic-condition & Hist-site
powers thread; civic standing + customs/etiquette; non-lethal combat states;
reprisal events) plus a default-adopt veto list (fishing, generic killmove
layer, projectile interception, performers, pilgrimages, rest-quality tiers,
brawls). Do not implement any §3 item before the 0039 rulings.

## 4. Implementation notes worth stealing (for the owning phase, one line each)

- **Detection** (the pull-in): Skyrim's full dice-free formula — light +
  sound (armour weight, running, muffle) + LoS ×0.3 + skill差 × distance²
  falloff; alerted enemies re-spot faster (*Skyrim:Sneak*). Morrowind adds
  the direction multiplier (×1.5 front/side, ×0.5 behind) — the ready-made
  minimal cone model.
- **Hyperarmour, canon answer to the open 10c question**: Morrowind staggers
  on every hit *except mid-attack/mid-cast* — attacking IS hyperarmour;
  knockdown immunity at Agility 100; downed actors take +50 % (*MW:Combat*).
- **H2H shape** for the decided-but-unowned finisher: fatigue damage →
  collapse → finishable; bypasses magic resistance; knockdown-into-shallow-
  water drowns — very Black Marsh (*MW:Combat*).
- **Fatigue as ONE universal multiplier** `0.75 + 0.5×(cur/max)` across all
  checks — the shape for our droppable §117.3 scalar (*MW:Combat* et al.).
- **Repair tools are consumables** with quality + use count; condition moves
  buy *and* sell price (*MW:Armorer*, *:Commerce*).
- **Merchant rules**: gold pools as the real anti-inflation cap; purses grow
  with your custom; merchants *equip* the best thing you sell them; selling
  the same item raises restock; investment = permanent gold + disposition
  (*MW:Commerce*, *Sky:Commerce*, *:Merchants*).
- **Trainers**: Skyrim's 5-per-level non-bankable cap, ceiling 90; Morrowind's
  2 game-hours per session + "each trainer sells only their top three skills"
  → master trainers are travel destinations (*Sky:Trainers*, *MW:Trainers*).
- **Disposition refusal ladder**: services → topics → conversation, with
  spell/reputation routes around the wall; too-small bribes insult;
  intimidate's gain reverses after (*MW:Disposition*).
- **Reputation bypass** for fail-forward: global reputation ≥ threshold
  substitutes for a dead gatekeeper NPC (*MW:Reputation*, *:Essential NPCs*).
- **Faction advancement gate shape**: faction rep + 2 attributes + 2 skills
  at rank thresholds; "make amends" reinstatement, twice = traitor
  (*MW:Factions*).
- **Enchanting**: passive recharge 1/20 s even in storage; CE and charged
  effects mutually exclusive per item; CE needs soul ≥400; recharge-by-gem
  can fail and eat the gem (*MW:Enchant*).
- **Souls**: trapped souls never releasable; smallest-sufficient-gem rule
  (*MW:Souls*).
- **Alchemy**: raw-eating gives first effect at ¼ XP (the free entry point);
  the four apparatus have distinct roles; potion weight = mean of
  ingredients (*MW:Alchemy*).
- **Torches**: finite burn only while carried, off-hand (competes with
  shield), **destroyed by deep water**, raise your detectability; placed
  lights burn forever (*MW:Lights*, *Sky:Torch*). The artificial-light gap's
  mechanics, gift-wrapped for a swamp.
- **Breath**: hard 20 s then 3 hp/s — concrete floor for criterion 25
  (*MW:Health*).
- **Arrow economy**: hits land in the target's inventory 25 % (they can
  shoot them back); ammo has its own persistent slot (*MW:Combat*).
- **Sealed documents**: Security's fourth verb — open and *re-seal* to hide
  tampering; failure marks the evidence (*MW:Security*). Made for our
  evidence sockets.
- **Skill books read-in-place** grant the point without theft — libraries
  become explorable (*MW:Skill Books*).
- **Crime details**: bounty per-region; animals/children count as witnesses;
  bounty collector +20 % outside the region; jail wipes pending progress
  (viciously good in a vastei economy); evidence chest burglable; issuing a
  contract **re-populates a cleared site** (*Sky:Crime*, *:Bounty Quests*).
- **Radiant's one good idea**, separable from the cut: prefer targets the
  player hasn't discovered (*Sky:Radiant*).
- **Shadowmarks**: diegetic sign-language on doors — the strongest shape for
  the informant/marker track in a no-marker game (*Sky:Shadowmarks*).
- **Worn-item dialogue keys** (Amulet-of-Mara pattern) generalise the
  factionSignal tag (*Sky:Marriage*).
- **Wait vs sleep are different verbs** with different consequences; sleep
  autosaves (*Sky:Sleeping*; *MW:Time*). Travel-counts-as-rest rewards the
  slow diegetic route (*MW:Transport*).
- **Difficulty**: a pure two-sided damage multiplier — matches our knob;
  steal verbatim (*Sky:Damage*).
- **Time constants**: MW is literally timescale 30 (ours, 0032); hostility
  amnesty 72 h; merchant reset 24 h; disease incubation 3 days (*MW:Time*).
- **Damage vs drain** on attributes/skills (permanent-until-restored vs
  expires) — the debuff economy's backbone (*MW:Health*).
- **Powers vs abilities vs spells**: once-per-day, free, work-while-silenced
  powers — our race `powers[]` has no stated semantics yet (*MW:Powers*).
- **Morrowind's leveled lists are one-way** (unlock upward, never rescale) —
  our rule is *stricter* than the soul-game's; worth stating (*MW:Leveled
  Lists*).

## 5. Verified absences (don't inherit as precedent)

Morrowind has **no** gambling, arena combat, tax system, mount system (three
static pack-guar props), companion system (quest escorts only — though
"followers board transport but can't follow a teleport" is a good D-tier
escort detail), or calendar events (Hircine's Hunt is scripted). Skyrim's
weather does **not** affect NPC behaviour in any documented way — don't
chase shelter-seeking AI. Skyrim hunting is not a system, just the
pelts→leather and meat→cooking chains (which we adopt via §1).
