# The player-purpose spectrum: what an enterable building has to give

Researched 2026-09-07 for the owner ruling of the same date. Binding
implementation: `tooling/world-generation/worldgen/player_purpose.py`. Router:
[docs/README.md](../../README.md); companion reading
[place purpose, hostility and dungeon balance](place-purpose-hostility-and-dungeon-balance.md),
[Morrowind content density](morrowind-content-density.md),
world [96 placement playbook](../../world/96-placement-playbook.md).

---

## 1. The ruling

> We should rarely place enterable buildings that are pointless for the player.
> "A dwelling to enter, kept by one of the newest households" gives nothing.
> Not every building needs a quest, but every enterable one should offer
> something on a spectrum of impact. Pure lore or flavour dialogue is not enough
> on its own. (Owner, 2026-09-07.)

Two clauses of the ruling are as binding as the first and are easy to lose:

- **Decoration is unlimited and out of scope.** Exteriors, ruins, wall stubs,
  gate arches, sheds with no door: atmosphere is the point of them and they
  carry no purpose obligation. The rule attaches to *doors*, nothing else.
- **Counts still come from the lore scale grounding, never from taste.** If a
  record's `scaleGrounding` justifies 26 households, the answer to "these huts
  are thin" is to give each hut a purpose, not to delete huts.

## 2. What the shipped games and their designers say

| # | Source | What it supports |
|---|---|---|
| 1 | Pascal Luban, *Open World Level Design: The Full Vision (part 2/5)*, Game Developer, 13 May 2020, [link](https://www.gamedeveloper.com/design/open-world-level-design-the-full-vision-part-2-5-) | Attach a return to the place: "Associate resources with points of interest. Players will naturally be guided to them." And the failure mode we are fixing: "If players realize that it is enough to walk around at random to find resources or targets, the exploration of the map becomes mechanical, aimless." Also argues for clustering points of interest into mini-clusters, which is what a settlement is. |
| 2 | Mateusz Tomaszkiewicz (quest director, CD Projekt Red), *From The Witcher 3 to Cyberpunk: the evolution of CD Projekt's quest design*, Game Developer, June 2019, [link](https://www.gamedeveloper.com/design/from-i-the-witcher-3-i-to-i-cyberpunk-i-the-evolution-of-cd-projekt-s-quest-design) | The flavour/consequence line should be blurred rather than clean: "Make the distinction between the two as blurred as possible. So you should be asking 'is this decision a flavor or will this have far-reaching consequences?'" Our tiers are that blur made countable. |
| 3 | Bruce Nesmith (Skyrim design lead), on the origin of Radiant, PC Gamer, [link](https://www.pcgamer.com/games/the-elder-scrolls/skyrims-version-of-radiant-ai-was-developed-from-a-drawing-todd-howard-made-on-a-napkin/) | The clearest statement of our problem in Bethesda's own history: in Morrowind the player interacted with houses and monsters and they did not interact back; Skyrim's brief was to make the world "point back at the player". Radiant composes a quest from location plus enemy plus **reward**, so the reward is a first-class term. |
| 4 | Hidetaka Miyazaki, Elden Ring release interview, Frontline Japan, 5 March 2022, [link](https://www.frontlinejp.net/2022/03/05/elden-ring-release-interview-with-director-miyazaki-part-1/) | Even the smallest occupied space earns its keep by returning something usable: NPCs "exist to give the player meaning, directions, and clues". Information is a legitimate return, which is why our medium tier includes it. |
| 5 | Maher Jaber et al., *The 40 Seconds Rule and Points of Interest in The Witcher 3: Wild Hunt*, Uppsala University, 2021, [link](https://www.diva-portal.org/smash/get/diva2:1569059/FULLTEXT01.pdf) | CDPR's own density target (something interesting roughly every 40 seconds), tested against play footage and found real but playstyle-dependent. Density targets must be tuned to how fast the player moves, which is why we set a *share* per settlement rather than a spacing in metres. |
| 6 | Joel Burgess and Nate Purkeypile, *Fallout 4's Modular Level Design*, GDC 2016, [slides](https://archive.org/details/GDC2016Burgess) | Bethesda tracks point-of-interest density and encounter pacing as tracked production metrics beside the kit work. Cited for the metric existing, not for a reward doctrine: the slides state no "every location must give X" rule. |
| 7 | Ken Rolston, *Development secrets of Oblivion*, Game Developer, 2017, [link](https://www.gamedeveloper.com/design/q-a-ken-rolston-s-development-secrets-of-i-the-elder-scrolls-iv-oblivion-i-) | Morrowind's authored density came from a tiny team writing most of the content by hand. Our answer is the same one Bethesda reached later: a typed vocabulary and kits, so density is cheap to author and cheap to check. |

**Not verified, do not cite.** A Bethesda "something interesting every 30
seconds / one landmark away" rule: no primary source exists. The documented
figure is CDPR's 40 seconds (source 5). The widely repeated criticism of
Morrowind's empty houses is forum opinion; argue it from source 3 instead.

## 3. The vocabulary

Twenty kinds in three tiers. This is closed: a purpose that is not on the list
is either dressing or a gap to be discussed. The file is where a new kind gets
added, with its Phase 12/13 cost written down beside it.

### Major: changes what the player can do, or what the world is

| kind | what it asks of Phase 12/13 |
|---|---|
| `quest-giver` | a cast slot and a dialogue tree at this door |
| `quest-stage` | a quest socket resolved inside this interior |
| `service-station` | a service: travel, healing, storage, repair, passage |
| `faction-door` | a faction join or rank interaction bound to an occupant |
| `unique-item` | one authored item, placed and never respawned |

### Medium: a real transaction, or knowledge the player can act on

| kind | what it asks of Phase 12/13 |
|---|---|
| `valuables` | an owned-goods loot table with ownership and crime flags |
| `lock-target` | a lock with a difficulty and a key holder |
| `actionable-information` | dialogue or a note that sets a world flag: a route, a price, a name |
| `trade` | a merchant inventory and gold pool |
| `training` | a trainer skill and cap |
| `bed` | a rentable or ownable bed with a rest gate |
| `crafting` | a crafting station of a named type |
| `cache` | a container with authored contents, hidden or owned |
| `witness` | an occupant carrying testimony a quest can query |
| `fence` | a merchant who buys stolen goods, behind a disposition gate |
| `usable-fixture` | a world object the player operates that changes state: a bell, a lamp, a winch |

### Minor: a real return, never sufficient alone

| kind | what it asks of Phase 12/13 |
|---|---|
| `rumour` | a rumour line naming a real place or person |
| `readable` | a book or note that unlocks a socket or a map mark |
| `hiding-place` | a navmesh pocket or container that breaks line of sight |
| `vantage` | a reachable high point with a sightline worth the climb |

## 4. The rule, as checked

On every parcel whose `interior.kind` is not `none`:

```jsonc
"playerPurpose": [
  { "kind": "fence", "tier": "medium",
    "note": "the newest household buys what the licence house would have asked about" }
]
```

- **HARD.** An interior with no `playerPurpose`, an unknown kind, a tier that
  disagrees with the kind, a note under 20 characters, or a parcel whose best
  entry is `minor` (flavour-only: make it dressing instead, `interior.kind`
  `none`).
- **WARN, per blueprint, at six enterables or more.** Fewer than 60 % of
  enterables carrying a major or medium purpose, or more than 40 % carrying a
  major one. The floor is a regression guard behind the hard rule; the ceiling
  is the constraint that binds in practice, because a settlement where every
  door is a quest reads as a theme park. Source 5 is why these are shares and not
  distances.
- **`purposeSummary`** is printed per blueprint by `python3 -m worldgen.blueprint`.

**Open, for whoever next touches the prose linter.** `lint_prose` scopes the
design-voice fields by name, so the new `parcel.playerPurpose[].note` strings
are outside the gate. They were written to the style guide and reviewed by a
separate agent, but a field pass over `playerPurpose[i].note` would put them
under `npm test` where they belong.

Naming: the prose sentence a reviewer reads on click stays at
`parcel.why.playerPurpose`; the typed array Phase 12/13 read is
`parcel.playerPurpose[]`. Same claim at two resolutions. The linter already treats the prose one as a
design-voice field.

## 5. Consequences for later phases

- **Phase 12 (interiors and dressing)** reads `playerPurpose[]` as its work
  list: a `crafting` entry is a station to place, a `cache` is a container to
  fill, a `bed` is a rent interaction. Nothing in an interior should be dressed for which no purpose asks. Every
  purpose must be dressed.
- **Phase 13 (population and quests)** binds `quest-giver`, `witness`,
  `training`, `fence` and `faction-door` to cast slots; the `occupants` block
  is where those people already are.
- **The crime and ownership systems** are pulled forward by `valuables`,
  `lock-target` and `fence`: an owned interior needs an owner faction and a
  crime response before any of the three mean anything.
