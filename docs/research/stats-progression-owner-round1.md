# Workstream S — owner round 1: the shaping decisions (one sitting)

> Step 4 of module 76 §103.1. Twelve questions + one accept/veto list, each
> self-contained with a recommendation the owner can simply accept. Reply in
> chat ("1A, 2A, … 13: accept all" plus any notes); answers get recorded here
> and as a decision record, then the design is detailed axis-by-axis (step 5),
> the numbers + simulation packets run (steps 6–7), and round 2 confirms.
> Analysis behind each: [mapping inventory](stats-progression-mapping-inventory.md);
> evidence: [reference games](stats-progression-reference-games.md),
> [repo/quest inputs](stats-progression-repo-baseline-and-quest-inputs.md).
> Minor calls are not asked here — they are proposed defaults (inventory §5),
> vetoable at round 2.
>
> **Status: OPEN — awaiting owner answers.**

## The questions

**1. How many core attributes?**
- **A (recommended): seven** — Morrowind's eight minus Luck (Strength,
  Intelligence, Willpower, Agility, Speed, Endurance, Personality). Luck's
  only mechanical job in Morrowind was modifying dice rolls, and we have no
  dice — it would be an empty stat.
- B: all eight, reinventing Luck (small bonuses to loot quality, crafting
  outcomes, rare finds).
- C: a lean five (what the code already stubs) plus Personality.
- Cost: A keeps the Morrowind sheet feel; B needs new mechanics invented for
  Luck; C is simpler but loses Speed/Personality texture the quests and
  movement systems want.

**2. How does the character get stronger?**
- **A (recommended): skills grow by doing** (swing axes → Axe rises), 
  **attributes rise automatically** as the skills they govern grow (no
  level-up screen, no multiplier minigame), and **levels consolidate when you
  rest**, adding health. The curve flattens at high values (Souls-style soft
  caps) so late-game power comes from gear, knowledge and system mastery —
  your "absurdly powerful through work" goal — not from the level counter.
- B: Morrowind's literal system, including the pick-3-attributes ×5-multiplier
  level-up screen. (Its most complained-about system: optimal play is
  spreadsheeting minor-skill grinds before every rest.)
- C: Souls-style — spend an earned currency on stats at rest points.
- Cost: A drops a nostalgic ritual (the level-up screen) in exchange for
  removing Morrowind's worst grind incentive; C would decouple growth from
  what you actually practise.

**3. Classes at character creation?**
- **A (recommended): full Morrowind structure** — pick a class or build a
  custom one: 5 major skills (start high, grow fastest), 5 minor,
  a specialization, 2 favoured attributes. Preset classes included.
- B: a light "background" (flavour + small bonuses only).
- C: classless (everything grows the same).
- Cost: A is the chassis as owned; it shapes growth *rates*, and gates
  nothing later.

**4. One energy bar or two?**
- **A (recommended): two layers.** Stamina stays exactly as tuned (attacks,
  rolls, blocks). Added: **Fatigue** — long journeys, sprinting, swimming,
  climbing and heavy loads wear you down over minutes, shrinking your
  stamina ceiling and regen until you rest. This is Morrowind's famous
  "tired characters do everything worse" rule, moved up a level so it never
  touches per-swing combat feel — and it gives swimming, climbing and
  deep-marsh expeditions real teeth.
- B: stamina only (no long-loop exertion).
- Cost: A adds one more bar to read; the simulation will check it can't
  death-spiral.

**5. What does weapon & armour skill actually buy?** (given a landed hit
always lands)
- **A (recommended): moves and economy, not raw damage.** Weapon skill
  unlocks attacks at thresholds (third light, second heavy, running/charged
  attacks), cuts their stamina cost, speeds *recovery* (never dodge/parry
  windows — the one thing Dark Souls 2 proved must never be stat-gated), and
  adds modest damage (~±20 %). Armour skill raises the protection of its
  class; how much you carry sets roll weight (fast/mid/fat). A
  poise/stagger layer (Elden-Ring-style: heavy attacks power through hits,
  enemies have a break-able posture) is designed now, implemented at 10c,
  tuned so today's feel is reproduced exactly at the reference loadout.
- B: damage-centric skill (big % swings from skill alone).
- C: unlocks only, no numeric growth.
- Cost: A means *found gear* stays the biggest damage lever — deliberate:
  in a fixed world, the best equipment is placed in dangerous ground, so
  power is geography you conquer (the thing Skyrim's modders retrofit).

**6. Magic: can casting fail?**
- **A (recommended): never fizzles.** Skill unlocks higher spell tiers, cuts
  magicka cost and casting wind-up, and scales power modestly so a mage
  keeps pace with a swordsman all game (Skyrim's flat-magic late-game
  collapse is the cautionary tale; the quest plan requires the hardest fight
  to be winnable by a magic build). Magicka regenerates slowly (Willpower)
  and fully at rest.
- B: Morrowind purist — spells have a failure chance and magicka only
  returns on rest.
- C: no fizzle, but rest-only regen.
- Cost: B recreates the "visibly did the thing, dice said no" frustration in
  real time; A needs the tier/cost curves to carry the skill's meaning.

**7. Healing?**
- **A (recommended): the flask is the combat healer** (as now: fixed
  charges, refills at rest), with more charges/potency found as placed world
  items; brewed and bought potions heal *slowly over time*, so alchemy is
  valuable but can't out-heal a fight.
- B: Morrowind potion-chugging (stackable instant heals).
- C: flask only, no healing potions at all.
- Cost: B quietly breaks fixed difficulty (grind past any wall with a full
  bag); C guts alchemy's usefulness.

**8. What does death cost?**
- **A (recommended):** wake at your last rest; the world stays exactly as it
  was (no enemy respawn-on-death wave); your **coin purse stays where you
  died** — one trip to recover it. Skills, attributes and items are never
  lost.
- B: nothing — just reload.
- C: harsher (lose skill progress or max health — the Dark Souls 2
  experiment players hated).

**9. Weapon & armour categories — keep/drop** (sourcing evidence verified;
all keeps have assets + animations with open permissions):
- **Recommended: KEEP** spears/pikes/halberds/quarterstaves; throwing
  weapons; crossbows (needs one sourcing job: pulling the Skyrim DLC files
  into our vault — which also brings Morrowind-style bonemold/chitin
  armour); **medium armour** (a data reclassification, zero new assets);
  unarmed combat (vanilla clips already in the vault, including clawed
  strikes for Argonians). *Optional:* katanas, rapiers, claws (free with the
  same mod). **DROP: whips** (the one weapon whose animations don't extract
  cleanly, and lore-weak).
- Answer: accept the list, or amend.

**10. Enchanting, spellmaking, alchemy — the god-build workshop?**
- **A (recommended): keep all three, bounded.** These are the "accidentally
  overpowered because you put the work in" engines. Bounds (from the
  documented Morrowind/Skyrim exploits): crafting strength reads your
  *base* stats (no potion-stacking loops); no enchantment may boost a
  crafting skill; big enchantments need rare souls and high-capacity items
  (both placed loot). The balance simulation will hunt surviving loops and
  we classify each as charm or breakage.
- B: alchemy only — cut enchanting and spellmaking (no quest ever requires
  them).
- C: alchemy + enchanting, cut spellmaking.
- Cost: A is the most design/balance work but is the Morrowind mastery
  promise; B/C shrink the workshop.

**11. Skyrim inventions worth keeping?**
- **A (recommended):** **smithing** (repair, improve, forge — one merged
  skill, with the improvement ceiling bounded so it can't trivialise fixed
  danger) and **learn-enchantments-by-destroying-magic-items** (loved
  mechanic; makes loot a knowledge economy). **No perk points** — skill
  thresholds already deliver the unlock joy without a second currency.
- B: none — pure Morrowind.
- C: A plus a perk-point economy.

**12. Gear wear and tear?**
- **A (recommended): keep condition** — weapons and armour degrade gently
  with use, repairable by skill/services; never a mid-fight breakage
  surprise (only unusable at zero). Feeds the economy, smithing, and loot
  storytelling (the wreck's cutlass is at 30 %).
- B: cut durability entirely (Souls 3/Elden Ring did).

**13. Province-specific findings — accept or veto each:**
- **a.** Crime is punished as **Owing debts** (assessed, auditable,
  regional), not a generic gold-bounty/jail system — the province canonically
  has no courts, treasury or state prisons; city jails are the only
  custodial fallback.
- **b.** **Speech becomes a first-class system**: checks are skill +
  personality + *evidence* + standing crossing authored thresholds (no
  dice) — the quest plan requires endings resolvable this way, and its own
  capability list forgot speechcraft (we'll fix that doc).
- **c.** **Unarmed** drains enemy stamina/posture toward a knockout finisher
  (Morrowind's fatigue-knockout, Souls-shaped).
- **d.** **Mysticism survives here as a folk school** even though the 4E
  Empire dissolved it — foreign magical institutions never took root in
  Black Marsh, so the old school survives in folk practice (lore note will
  be recorded; keeps Morrowind's six-school feel).
- **e.** **Racials at Morrowind weight** (real permanent packages: Argonians
  = poison immunity, 75 % disease resistance, water breathing,
  athletics bonus…), including the canon **beast-race gear limits** (no
  boots, no closed helmets for Argonians and Khajiit).

## Answers

*(recorded here when the owner replies)*
