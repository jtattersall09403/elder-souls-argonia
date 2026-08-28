# How Morrowind, Oblivion and Skyrim reward you — main quest and factions

Researched 2026-08-26 from UESP (MediaWiki API, project user-agent) for the
main-quest side-reward design (owner directive). Evidence only; the design that
consumes it is [../quests/30-main-quest.md](../quests/30-main-quest.md) §24b and
[../quests/60-writing-and-lore.md](../quests/60-writing-and-lore.md) §50.

## 1. The reward genres, and which game proved each

| Genre | Evidence |
|---|---|
| **Signature gear at a named milestone** | Oblivion DB: Shrouded Armor + Hood after *A Knife in the Dark*. Oblivion TG: the Gray Cowl of Nocturnal only after *The Ultimate Heist*. Skyrim: Nightingale set, Arch-Mage's robes. The item *is* the rank. |
| **A drip of unique enchanted items — roughly one per quest** | The purest case is Oblivion's Dark Brotherhood: Black Band, Sufferthorn, Scales of Pitiless Justice, Cruelty's Heart, Shadowhunt, Dagger of Discipline — a distinct named enchanted item after nearly every contract. Cheap to produce (re-materialled mesh + enchantment record), and it is most of why that line is remembered as generous. |
| **Economic access** | Oblivion TG: fences unlocked **in a fixed order by rank** (Ongar at Pickpocket, Dar Jee at Bandit…), each with a gold cap and mercantile level; Doyens clear bounties at **half price without confiscating stolen goods**. Oblivion FG/MG: everything inside a guild hall becomes free to take; members-only trainers and merchants. |
| **Disposition / price effects** | Oblivion MG: **+20 disposition with all members on joining, +20 more per promotion**. A flat, legible social dividend. |
| **A capability unlock (not an item)** | Oblivion MG: completing the Recommendations opens the **Arcane University** — spellmaking and enchanting, i.e. a whole crafting system gated behind faction progress. |
| **A salary, with a strategic choice attached** | Oblivion FG at Master rank: a monthly chest of gold/weapons/armour, and you set guild strategy — **recruitment yields items, contracts yield gold**, 50/50 balances. Player-directed income. |
| **A base, built in stages** | Morrowind Great House strongholds: a multi-quest chain (contract → land deed → construction → check on progress → phase two → phase three), each phase adding buildings and population. |
| **Consumables with a unique rule** | Oblivion DB Poisoned Apples — weightless, and they **bypass poison resistance**. A small item that opens a tactic nothing else does. |
| **A permanent character change with real trade-offs** | Morrowind corprus: drains Willpower, Intelligence, Personality and Speed while **fortifying Strength and Endurance**, worsening over time, NPCs react with fear and disgust — then the cure leaves permanent disease immunity. This is the "dark gift with a price" pattern in its canonical form, and it is *pure stat modifiers* — no bespoke art. |
| **New verbs / abilities** | Skyrim Shouts: **15 words of power come from the main questline alone**, each a new thing the player can *do*. |
| **Prestige gear + title at the finale** | Oblivion: Champion of Cyrodiil and a suit of **Imperial Dragon Armor**, "normally only worn by the Emperor", collected two weeks later. |
| **Recognition that changes how the world treats you** | Morrowind Hortator/Nerevarine: Great Houses and Ashlander clans formally accept you. |

## 2. Main-quest rewards specifically

Morrowind's main line is the closest model to ours, and it gives three
different *kinds* of thing:

- **Moon-and-Star** — an identity artifact. Canon: it "lent Nerevar
  supernatural powers of **persuasion** and indisputable proof of identity,
  since **any other who tried to wear it would be killed instantly**", and it
  is what let him unite the warring clans. A ring that is simultaneously a
  stat item, a plot key and a legitimacy claim.
- **Wraithguard** — an enabling artifact. Without it you can still finish, but
  using the endgame tools costs **50–124 damage per second**. The reward makes
  the finale survivable rather than possible.
- **Corprus** — a transformation, above.

Oblivion's main quest pays almost nothing until the very end, then pays in
prestige (title + unique armour). Skyrim pays continuously in **abilities**
(shouts) plus a signature weapon (Dragonbane).

**The lesson for us**: a main quest should pay in *at least two* of
{artifact that grows, new ability, transformation with a price, prestige at the
end} — and Morrowind's best trick is that its signature artifact is also a
**political credential**, which is exactly the shape of the Eye of Argonia and
the empty Scalded Throne.

## 3. Structural notes worth copying

1. **Rank-gated, fixed, and announced.** Nothing scales; every reward is tied
   to a named quest or rank, and players learn the ladder early — which is what
   makes the ladder motivating.
2. **Faction rewards match the faction's playstyle**, so the reward *teaches*
   the fantasy: thieves get fences and a cowl, fighters get trainers and a
   salary, mages get a crafting system.
3. **Access is a reward.** Half of the Oblivion guild "advantages" are
   permissions and services, not objects — free lodging, free supplies,
   trainers, bounty removal, better prices.
4. **One reward per quest is a real budget.** Oblivion's DB shows the drip
   model is affordable when items are re-materialled variants with distinct
   enchantments rather than bespoke models — which is exactly our constraint.
5. **Trade-offs are allowed and memorable.** Corprus is beloved *because* it
   costs something; the same is true of the Sixth House material generally.
