# 0028 — Allegiance reward tracks, the quest index, and the novelty rule

**Date:** 2026-08-26 · **Status:** accepted · **Scope:** `docs/quests/`,
`docs/world/76-stats-progression.md`, `docs/research/`

## 1. The problem

The main quest asked the player to pick sides on argument alone. There was no
*felt* reason to favour one — no escalating, side-specific payoff that gives
the player skin in the game, and nothing like the Sixth House's dark gifts.

## 2. Research

UESP mined for how all three reference games reward faction and main-quest
progress — evidence in
[../research/tes-quest-and-faction-rewards.md](../research/tes-quest-and-faction-rewards.md).
The reward genres proven there: signature gear at a named rank; a drip of
unique enchanted items roughly one per quest (Oblivion's Dark Brotherhood);
economic access (rank-ordered fences, half-price bounty relief, members-only
trainers, free guild property); +20 disposition per promotion; a capability
unlock (the Arcane University = spellmaking and enchanting); a salary with a
strategy attached; a base built in phases; consumables with a unique rule; a
permanent change with trade-offs (corprus — *pure stat modifiers*); new verbs
(15 shout words from Skyrim's main line); prestige gear and a title at the
finale; and recognition that changes world behaviour. Morrowind's key trick:
its signature artifact, **Moon-and-Star**, is a stat item, a plot key *and* a
legitimacy claim at once — the exact shape of our Eye and empty throne.

## 3. Decision — four tracks on the sides that already exist

Not new factions or characters: reward ladders bolted to the four sides the
main quest already contains, specified in
[../quests/30-main-quest.md](../quests/30-main-quest.md) §24b.

| Side | DNA |
|---|---|
| **Unbound Root** (→ CUT) | Power with a price |
| **Veiled Reed** (employer) | Access, information, leverage |
| **Root Talk / tribes** (→ MEND) | The marsh stops trying to kill you |
| **Yourself** (→ CLAIM) | The artifact and the crown |

Five tiers each. Two new standing variables (`rootTalkStanding`,
`independentLeverage`) join the existing trust values in the branch-state model.

**Owner decisions (2026-08-26), all three as recommended:**

1. **Corprus model for the cult** — each rite raises Strength/Endurance and
   drains Willpower/Personality, deepening per tier. Pure stat modifiers, no
   art. Visible marking (gold tongue, bark scale) stays flavour text only —
   the owner flagged body-marking as a coding faff and it is not required.
2. **Stack low, lock high** — tiers 1–3 freely stackable across all four
   tracks; tiers 4–5 mutually exclusive and telegraphed before commitment.
3. **One stronghold, phased, re-skinned by allegiance** — a single reoccupied
   site built in three phases on the Morrowind Great House model; the dominant
   track changes staffing, services and dressing. Reserved at world Phase 11,
   interiors at Phase 12.

Owner corrections applied along the way: the Reed's record-rewriting is the
*mechanism* for recruiting informants and buying services, never an end in
itself; its headline reward is an **informant network that marks things on the
map** (powerful precisely because we have no quest markers). The tribes' track
is concrete — village welcome, prices, healing, gifts, canon field kit, and
root-tunnel fast-travel — with **no companions anywhere**.

**This is a live demand on workstream S** (stats), registered in module 76
§103.1's completeness sweep: the scale must express trade-offs, gear ladders,
granted abilities and price effects as fixed absolute values (0004).

## 4. Decision — the quest index and novelty rule

Separately: agents authoring quests in different packets, at different times,
would independently reinvent the same premises. New module
[../quests/55-quest-index.md](../quests/55-quest-index.md): one line per quest
(ID · title · region · shape tags · premise), a 16-entry **shape taxonomy**
about premise rather than verb, and a binding **novelty rule** — declare shapes,
scan for collisions (same region / line / reversal / resolution), then
differentiate, merge or drop, and add the row in the same change. Plus a
per-region shape budget (no shape twice, once at M/L) and a requirement that
each packet introduce a shape new to its region and one `WONDER`. The index's
coverage gaps are the standing commissioning brief for the next packet.

Wired into the quests router, the agent-authoring workflow (80 §65), the
co-design loop (90 §65b), the local-quest rules (50) and the validators (80
§63). It becomes a generated artifact once quests are machine-readable at Q1.
