# Factions — system, eight major lines, compact lines

> Module of the quest/narrative master plan (see [README](README.md)).

# Part VI — Faction system

## 27. Faction principles

Major factions should feel like institutions rather than personal quest dispensers.

**Every line's recurring cast is specified in [36-cast-roster.md](36-cast-roster.md) §56** —
its **desks** (stationary patrons, each fixed at one post, each with a distinct
ethic), **the argument** between two of them that the finale resolves, and the
come-and-go cast around them. Read it before writing any quest in a line; the
quest tables below name people only where the quest turns on them.

Each line requires:

- ordinary work before the central conspiracy;
- **3–5 stationary desks with fixed posts and distinct ethics, one live
  argument between two named desks, a mid-line moment where the player must
  pick a desk, and a finale that resolves the argument**; at least one desk
  can die, leave or turn (35-cast §53.5–53.6);
- skill, reputation and sponsorship gates;
- a headquarters with day-to-day activity;
- consequences for failure, expulsion and rival membership;
- branch choices that emerge over several quests;
- local aftermath after completion;
- no automatic supreme leadership;
- no need for main-quest faction alignment.

Faction membership may give an alternate method in the main quest—boat access, interpretation, stealth route, legal access—but the main quest always has an independent route.

## 28. Reputation and advancement

```ts
interface FactionStanding {
  membership: "none" | "associate" | "member" | "senior" | "expelled";
  reputation: number;
  competencyFlags: Set<string>;
  sponsors: Set<string>;
  branchCommitments: Set<string>;
  incompatibleSeniorRoles: Set<string>;
}
```

Advancement should consider:

- completed duties;
- faction-specific skills or demonstrated methods;
- disposition of patrons;
- serious misconduct;
- rival senior roles;
- branch choices.

A skilled non-combat character can advance in the Marsh Charter through tactics, negotiation, healing or monster knowledge where quests support it; they cannot become its senior combat captain without demonstrating any relevant capability.

## 29. Senior-membership incompatibilities

| Senior role | Incompatible or strongly conflicting role |
|---|---|
| State-chartered Shadowscale | Night-Reed criminal leadership; anti-state independent Shadowscale |
| Dark Brotherhood-aligned Shadowscale | Anti-Brotherhood Shadowscale; some public League offices |
| Night-Reed oligarch/blackmailer | Senior League public office |
| Night-Reed redistributive branch | Compatible with lower League membership; conflicts with strict law-enforcement office |
| Reed-Sail pirate/cartel chief | Marsh Charter state auxiliary; senior League regulator |
| Marsh Charter An-Xileel auxiliary | Reed-Sail pirate branch; some closed Conclave outcomes |
| Sunken Archive Synod office | College of Whispers or independent senior office |
| Closed Many-Root leadership | Senior Open Water civic office |
| Formal state-aligned Nisswo | Unbound Root main ending and some independent Nisswo outcomes |

Incompatibilities must be telegraphed before the commitment.

## 30. Main-quest separation rule

The Veiled Reed and Unbound Root are main-quest alignments. They are not ordinary completionist faction lines.

Major factions may:

- recognise the player;
- offer one alternate route;
- contribute one expedition contact;
- react to an ending.

Each expedition contribution (MQ27/MQ05) carries an **availability condition
tied to the contributing line's end-state**: an ending that guts the
contributing group withdraws its contact, and the expedition's option set
degrades accordingly — its independent route never does. The Waykeepers'
Helstrom rootworm terminus survives every RW end-state (§42).

They should not:

- require main-quest completion;
- replace main-quest actors;
- determine the main ending solely through membership;
- have their entire leadership rewritten by main-quest state;
- force every player to complete them.

## 30b. Tier protection (hard rule)

Quests are tiered: **tier 0** the main quest, **tier 1** faction lines,
**tier 2** everything else. A quest may only *break* — kill, exile, relocate,
destroy, occupy, or force a state onto — people, places, items, topics and
variables **owned by its own tier or below**; reads are always free. Tier-1
lines may break each other only with the §29 telegraph. The §20 branch-state
variables ([30-main-quest.md](30-main-quest.md)) are **written by main-quest
stages only**; faction and local content keeps its own reputation, which the
main quest may read. **Protected registry:** C1 principals
([35-cast.md](35-cast.md)) and every main-quest `LOC`/`STATE`/evidence/topic
id are tier-0-owned. All NPCs remain killable *by the player* — killing one
essential to a higher tier triggers the doom-warning message
([30-main-quest.md](30-main-quest.md) §23), never a silent break. A faction
line may change a shared principal's office, never require or script their
death; a C1 serving as a faction desk cannot be that line's mortal desk.
Every new quest brief declares a **`touches` list** (shared NPCs, LOCs,
STATEs, items, variables — read or write); the validators (80 §63) fail any
brief writing an id owned by a higher tier.

---

# Part VII — Eight major faction questlines

## Faction depth tiers

All eight lines below are designed to their full shape, but production depth is staged:

- **Deep at Milestone 1 (10–12 quests):** Shadowscales, Night-Reed Chapter, Nisswo of the Turning Path, Many-Root Conclave. These four are the most Argonia-distinctive — the content no other Elder Scrolls game could contain — and carry the province's identity. They ship complete.
- **Standard at Milestone 1 (6–8 quests, extendable to 8–10):** Marsh Charter, Sunken Archive, Reed-Sail Compact, League of Open Water. Their quest tables below mark with **(W2)** the entries deferred to the second content wave; each line's opening arc, mid-line spike and finale ship in Milestone 1 so no faction feels truncated.

The deferral principle: cut breadth before depth, and never defer a line's finale.

## 31. The Empty Cradle — Shadowscales

**Type:** Major joinable  

**Premise:** A contested attempt to revive an order that Skyrim’s Veezara calls extinct. Canon dates the collapse precisely: the Archon training facility was shut down in **4E 187**, and the **last known living Shadowscale dies in 4E 201** — the year of play. The Dark Brotherhood's Bravil Listener, **Alisanne Dupre**, and **Rasha**, who led the Cheydinhal sanctuary, already planned to revive the facility in response to the Brotherhood's decline — a canon-named external bidder with a canon-named motive. And the **Black-Tongues (Kota-Vimleel)**, who dedicate almost all their resources to producing Shadowscales, have had nowhere to send Shadow-born hatchlings for fourteen years; what they have done with them instead is the line's strongest unclaimed hook (lore: topics/sithis-nisswo-shadowscales.md; archon.md). The line asks whether birth, tradition, state power or consent can recreate the Shadowscales.  

**Themes:** Duty, consent, political assassination, institutional authenticity and the difference between a real tradition and a useful costume.  

**Ranks:** Watcher → Knife-Bearer → Writ-Keeper → senior branch office. Leadership is possible only in the independent branch and remains accountable to a council.  

**Senior exclusions:** State-controlled senior rank conflicts with senior Night-Reed/League roles; Brotherhood affiliation conflicts with an anti-Brotherhood independent ending.  

**World-generation summary:** One ruined cradle, one adaptable sanctuary, target homes/offices, rooftops, canals and underwater exits. Reuse existing city fabric; do not build a separate province-scale assassin network.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| SS01 | Last of the Scale | A dying contract-killer claims to be the last trained Shadowscale — canon's last known living Shadowscale dies in 4E 201, and this quest is that death — and asks the player to recover a list of surviving initiates before the An-Xileel or Dark Brotherhood does. | **P11/P12/P13:** `LOC shadowscales.safehouse_ruin` — the natural site is the Archon training facility, standing and sealed since 4E 187 (lore: archon.md); sickroom, hidden archive, two entrances, document fallback and one small ambush. | L08–L09, L29; A02, V03 |
| SS02 | Writ Without a King | The first test is a historical writ whose issuing authority no longer exists — and may never have: canon holds the Scalded Throne empty "for centuries (if it existed at all)", so the royal chain of command was a claim the order made about itself (lore: topics/sithis-nisswo-shadowscales.md). The player can execute, investigate, expose or void it; each choice establishes the order’s legal philosophy. | **P11/P12/P13:** Target home/work route, public records office, rooftop/underwater approaches, witness sockets and non-lethal resolution. | L08–L09; A02, A18, V02–V03 |
| SS03 | The Empty Cradle | A ruined hatchery appears abandoned, but records show children were redirected into state service after the old order’s collapse. The player finds one survivor who denies ever consenting. | **P10/P12/P13:** `LOC dungeon.empty_cradle`; nursery, training yard, flooded archive, traps and memory props; no child NPC dependency. | L08–L09, L12; A01–A03, A20–A23 |
| SS04 | Born Under Shadow | An adult born under the Shadow is being claimed by rival revivalists — among them the **Black-Tongues**, who identified them at hatching and have quietly kept and trained Shadow-born since the school closed in 4E 187 (lore: topics/sithis-nisswo-shadowscales.md). Their birth sign does not settle their wishes, fitness or obligations. | **P11/P12/P13:** Two faction meeting spaces and neutral hearing room; adult claimant home/schedule; limited duel arena. | L08, L33; A02, V03 |
| SS05 | A Brother from Falkreath | A Dark Brotherhood emissary offers training, contracts and Listener legitimacy in exchange for absorption — executing the revival Listener Dupre and Rasha planned before the Brotherhood's own collapse (lore: topics/sithis-nisswo-shadowscales.md). The emissary is useful, courteous and plainly seeking control. | **P11/P12/P13:** Guest safehouse, ritual chamber and discreet dock/escape; 4-actor negotiation marks. | L09, L29; A02, V03 |
| SS06 | The Honest Target | A contract names a corrupt magistrate, but the patron is a smuggler trying to erase a conviction. Bonus conditions reward discovery and restraint, not one prescribed kill method. | **P11/P12/P13:** Magistrate courthouse/home, smuggler warehouse, patrol schedules, poison/stealth/social approaches and evidence sockets. | L08–L09; A18–A20, V02–V03 |
| SS07 | Two Knives, One Name | Two assassins use the same Shadowscale title. One is an impostor; the other committed an atrocity under a genuine writ. Authenticity and innocence diverge — and the order's own law makes it worse: canon holds that **a Shadowscale may not kill a fellow Shadowscale**, and that tenet-breaking is punished by an assassin sent by the **Argonian Royal Court**, which does not exist and canon doubts ever did. So whoever executes either of them is **claiming the empty throne's authority**, which ties this line to the main quest's kingship question without requiring a single main-quest stage. | **P11/P12/P13:** Twin safehouses, **pursuit-by-inference** route (three sites, each already vacated, read the exit from the evidence — no fleeing-NPC pathing), interrogation room and fail-forward journals. | L08–L09; A02, V03 |
| SS08 | The State’s Hand | The Veiled Reed offers an official charter: legal protection and resources in return for state-directed contracts. It is the third bidder — after the Brotherhood (SS05) and the Black-Tongues (SS04) — for an order everyone wants and nobody made. Refusal leaves the order vulnerable but independent. | **P11/P12:** An-Xileel office, Shadowscale council chamber and branch-specific banner/guard state only. **Touches:** no main-quest writes — zero coupling to `veiledReedTrust` (§30b); the Reed's charter offer is recognition dialogue and local charter state only. | L02, L08–L09; A02–A03 |
| SS09 | No Listener in Black Marsh | A ritual meant to contact the Night Mother yields ambiguous evidence and a staged deception. The player can bind the order to the Brotherhood, expose the fraud, or adopt a local non-mystical charter. | **P12/P13:** Ritual sanctuary, coffin/crypt, acoustic/lighting variants, secret observer route and one compact combat space. | L08–L09, L29; A02, A20, V03 |
| SS10 | Shadow at Dawn | The surviving claimants force a final choice: state service, Brotherhood affiliation, independent ethical order, or dissolution with records returned to victims. | **P11/P12/P14:** One shared headquarters with four local end states; NPC schedule swaps, contract board variants and epilogue letters. | L02, L08–L09, L29; A02–A03, V03 |

## 32. Night-Reed Chapter — Thieves Guild

**Type:** Major joinable  

**Premise:** A **native** criminal organisation, not a Cyrodiilic franchise: canon's Thieves Guild runs along provincial lines with little coordination, and no Imperial chapter ever took root in Argonia — the native precedents are Pusbottom, Alten Corimont, the Blackguards and the tribeless Naga (lore: topics/guilds-and-orders.md §3). The Night-Reed is the organisation a Cyrodiilic guild would recognise as a peer, adapted to canals, boats, flooded districts and rootworm routes. The line escalates from local theft to a province-famous heist.  

**Themes:** Skill, loyalty, urban dispossession, professional restraint, criminal mutual aid and the seduction of blackmail power.  

**Ranks:** Lookout → Cutpurse → Water-Rat → Night-Reed → senior branch outcome. No compulsory Nocturnal oath.  

**Senior exclusions:** Senior criminal-oligarch leadership conflicts with public League office; a redistributive guild can coexist with lower League rank but not its law-enforcement branch.  

**Desks:** three fixed patrons — Deep-In-Her-Cups (the Soulrest den), Vasha "Half-Rent" (Lilmoth, above the Pusbottom pawnshop) and **Sails-By-Morning** (Archon: the fence-den of TG05's network made a chapter desk; late 50s, a translated name given *at* her — the goods sail by morning, she has not left the den in years). Her ethic completes the triangle: where Soulrest preaches restraint and Lilmoth preaches leverage, Archon preaches **velocity** — hold nothing, blackmail no one; a fence's only safety is that the evidence is already at sea. **Quirk:** a tide table nailed to the den wall; every price she quotes is keyed to the next departure. Full cast in [36-cast-roster.md](36-cast-roster.md) §56.

**World-generation summary:** Prioritise Soulrest and Lilmoth docks, a reusable guild den, connected rooftops/canals/sewers, the Archon fence-den, several target interiors and the large Tidal Palace heist complex.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| TG01 | A Dry Hand in a Wet City | The player proves value by recovering stolen property without harming the thief who took it from another thief. Observation and social leverage beat burglary alone. | **P11/P12/P13:** `LOC soulrest.night_reed_den`; dockside tavern, back rooms, roof and canal exit; small target house with 3 approaches. | L28; V02, A18–A20 |
| TG02 | The Drowned Lockbox | A lockbox lies in a recently sunk counting house. Three clients claim it; the contents reveal that none told the whole truth. | **P3/P8/P9/P12/P13:** Submerged counting-house interior, air pocket, street entrance, underwater escape and fixed ownership evidence. | L01, L28; A10, A18, A20 |
| TG03 | Honest Customs | Customs officers run an illegal tariff while a smuggler uses the scandal to move captives. The guild can steal the tariff ledger, expose both, or take over the route. | **P11/P12/P13:** Customs house, holding cellar, dock patrol schedules, boat route and evidence sockets. | L16, L28; V02, V07, A13, A18–A20 |
| TG04 | The House That Floats | A wealthy home is periodically moved between moorings. The burglary becomes a navigation and timing problem with optional social entry and underwater hull access. | **P9/P11/P12/P14:** Fixed staged houseboat at three static moorings selected by schedule/state swap — the "simulated moving route" option is explicitly dropped as engine-scope risk; deck/interior/hull portals; actor schedules and low-cost state swaps. | L17–L20, L28; A11–A14, V07 |
| TG05 | A Fence in Every Port | Candidate fences in Soulrest, Lilmoth and Archon compete. The player investigates reliability and hidden loyalties rather than delivering arbitrary quotas. | **P4/P11/P12:** Three small shops and safe rooms with stable IDs; route graph; branch-specific merchant availability. | L28; A19–A20, V02 |
| TG06 | The Rootworm Robbery | The guild plans to intercept a sealed state packet during rootworm transit. Choices include impersonation, route diversion, bribing Waykeepers or stealing after arrival. | **P4/P9/P11/P12/P13:** the route's station pair is the **Helstrom hub and the east-estuary station**, with the intercept and all playable staging at the east-estuary end (reachable by scheduled boat — no D4/D5 traversal implied); the Helstrom end is planning and dialogue only. Service tunnel, passenger/waiting area and sealed packet sockets; the worm itself is never on screen (§42) — transit reads through the pen's disturbed water and the packet's arrival. Root-transit station positions are Pass-1 placeholders re-authored with Hist-node placement at world Phase 11; this brief is finalized in that packet's co-design loop. | L19–L20, L28; A20, A24 |
| TG07 | The Informer’s Cut | Someone is selling guild routes, and every beat points at Silt, the den’s fast young climber — who is innocent, is never told she was suspected, and must be cleared without alerting the real informer: someone the den trusts too much to watch. | **P11/P12/P13:** Guild den subrooms, three suspect homes, surveillance perches and staged accusation scene. | L28; V02, A18–A20 |
| TG08 | The Vault Beneath Pusbottom | A preliminary heist into a flooded municipal vault teaches route planning: rooftop, sewer, underwater cistern or forged maintenance order. | **P8/P9/P11/P12/P13:** `LOC lilmoth.pusbottom_vault`; four entrances converging on one vault, patrol routes, locks, water and no-kill bonus. | L14–L16, L28; V02, A10, A18–A20 |
| TG09 | Tools of the Grand Heist | The player chooses two of four preparations—inside schedule, breathing charm, forged seal, or portable counterweight—each opening an optional route. None is a mandatory fetch chain. | **P11/P12/P13:** Four compact preparation locations already causal in the city; tool sockets and route flags; allow direct difficult heist without preparations. | L28; V02, V09, A19–A20 |
| TG10 | The Palace Below the Tide | The major heist targets Lilmoth’s Crown Ledger and treasury. It crosses public reception rooms, roofs, service canals, sewers, an underwater cistern and a guarded archive. One canon security system: **ripper eels trained to hunt canal-crossers**, which do not attack anyone who has rubbed themselves with eel-slime — a known, obtainable, revolting counter (lore: topics/ecology-encounters-loot.md §2). Methods remain player-chosen. | **P8/P9/P10/P11/P12/P13/P14:** `LOC lilmoth.tidal_palace`; connected multi-route heist complex, patrol schedule, disguise/social checkpoints, ripper-eel canal hazard with eel-slime counter, treasury, ledger, vault and boat escape; 60–90 minute target. All water staging works through canal and cistern levels, never a visibly dramatic tidal swing (built tide amplitude is small). | L14–L16, L28; V02, V07, V11–V12, A10, A18–A20 |
| TG11 | Who Owns the Night? | The ledger proves that guild patrons, merchants and officials jointly engineered housing seizures. The player can expose it, sell it, redistribute wealth, or use it to build a disciplined criminal oligarchy. | **P11/P14:** Shared guild hall with four end states; merchant/fence schedules, selected property/NPC changes and epilogue notices only. | L14–L16, L28; A19–A20, V02 |

## 33. The Marsh Charter — Fighters Guild tradition

**Type:** Major joinable  

**Premise** *(corrected by the lore pass, 2026-08-25)*: canon is clear that the Fighters Guild's charter died with Imperial authority here and its **function was absorbed by native institutions** — the **Four Winds of Stonewastes** (hereditary defenders "active since their ancestors erected their first hut"), city **shellback** levies, tribal **kaals**, and whoever a village hires to deal with a wamasu (lore: topics/guilds-and-orders.md §2). The Marsh Charter is therefore **a native martial tradition arguing about whether to accept a foreign form**, not a Fighters Guild branch operating in a swamp. The old Hissmir and Alten Corimont guild halls are lodging and warehouse, and somebody keeps proposing they be reopened.  

**Themes:** Professional competence, public service, ecology, exploitation, and whether accepting a charter means becoming foreign.  

**Ranks:** Recruit → Proven Blade → Contract Captain → charter branch office. Promotions require combat or tactical competence plus sponsors.  

**Senior exclusions:** An-Xileel auxiliary ending conflicts with pirate/cartel Reed-Sail leadership; public-service ending can coexist with most civic factions.  

**World-generation summary:** One main guildhall/training yard, one reusable frontier fort, villages with defence sockets, fixed creature habitats and contract boards.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| FG01 | A Contract in Mud | A straightforward settlement-defence contract reveals that the employer understated the danger and overcharged residents. | **P4/P11/P13:** D1 village, palisade, creature approach lanes, contract office and aftermath NPC sockets. | L27; A04–A08, V01 |
| FG02 | The Missing Patrol | A patrol vanished after refusing a charter officer’s unsafe order. Tracks, equipment and survivor testimony reveal negligence, not a monster ambush. | **P6/P13:** D2 marsh patrol route, evidence trail, survivor shelter and small predator territory. | L21, L27; A07–A08, V01 |
| FG03 | Wamasu Season | A juvenile Wamasu threatens farms because hunters killed its prey and stole eggs. Options include killing, relocating, returning eggs or exposing trophy hunters. | **P3/P4/P9/P13:** D2/D3 wetland territory, nest, farm edge, boat access and large-creature combat arena. | L12, L27; A06 **(deferred wild wamasu — requires the deferred Mihail ingestion incl. conversion spike + audio replacement, or a species amendment per 0027 §3, e.g. A08 crocodile)**, A13, V01 |
| FG04 | The Beast in the Ledger **(W2)** | The guild has billed several villages for the same slain creature. The player investigates forged trophies and staged attacks. | **P11/P12/P13:** Guild records room, tax office, butcher/trophy store and two villages with evidence sockets. | L27; A20, V12 |
| FG05 | A Fort Paid Twice | Two communities financed the same fort restoration and both expect protection. The commander plans to abandon the poorer settlement. | **P11/P12/P13:** Reusable frontier fort, two road/water approaches, barracks and council scenes; guard assignment state variants. | L01, L27; V06, A19 |
| FG06 | Mercy for a Monster | A supposedly man-eating Argonian transformed by disease retains reason intermittently. Healers, victims and guild officers disagree on cure, containment and execution. | **P11/P12/P13:** Quarantine hut, healer space, victim homes and secure encounter room; use existing humanoid/creature assets, no bespoke transformation. | L12, L27; V09, A07 |
| FG07 | The Price of Protection | Local officers encourage bandits to keep villages dependent on guild contracts. The player can expose, seize or redirect the racket. | **P4/P11/P12/P13:** Roadside bandit camp with causal trade-route placement, guild office, village and ambush route. | L27; V06, A04–A05 |
| FG08 | Charter War | Reformers, mercenary captains and the **Four Winds** compete over what the Charter is for. Ka-Deelith Ushu's position — that a paid, portable, chartered defence is a foreign disease and an unpaid hereditary one is the only kind that stays — is the hardest to argue with and the least practical. Demonstrated skill, sponsorship and prior conduct determine who follows the player. | **P11/P12:** Guildhall meeting floor, training yard, records archive, `LOC blackwood.stonewastes` Four Winds hall and branch banners; no city battle. | L27; A04–A05, V06 |
| FG09 | The Contract No One Signed | A lucrative extermination order targets a marsh community that never requested help. The real client wants their land and water access. | **P4/P11/P13:** Remote D3 community, disputed resource site, client estate and non-hostile/hostile encounter configurations. | L01, L16, L27; A15–A17, V12 |
| FG10 | No Master of Arms | The player resolves the guild as public-service charter, disciplined mercenary company, An-Xileel auxiliary, or broken protection cartel. Rank depends on martial competence and decisions. | **P11/P14:** One guildhall with four local states; patrol/contract board swaps and settlement letters. | L02, L27; A03–A05, V06 |

## 34. The Sunken Archive

**Type:** Major joinable magical/scholarly faction  

**Premise:** Black Marsh scholars operate between local custodians, the Synod and College of Whispers after the Mages Guild’s dissolution. Canon leaves Argonia with **no resident magical institutions at all** (the Synod had no presence within ~400 miles of Lilmoth), so both foreign bodies work through intermediaries, each with a distinct canon motive: the **Synod** hunts artefacts of power (its declared 4E 201 project), and the **College of Whispers** — canon's open necromancers with the best Umbriel intelligence — seeks **Umbriel's dead**, which from the Argonian side is grave desecration on a mass-grave scale; it is the province's most legible foreign magical antagonist. And the minister who performed the Umbriel ritual, **Hierem**, was a Synod member with "vast influence" over it — a fact the Veiled Reed's records would hold, and a permanent Argonian reason to refuse the Synod anything (lore: topics/guilds-and-orders.md §2).  

**Themes:** Ownership of knowledge, research ethics, translation, foreign institutions and the political force of archives.  

**Membership correction** *(lore pass, 2026-08-25)*: canon says magic here is **folk literacy, not a profession** — "most simple day labourers in Black Marsh" are accomplished Illusionists, and every magical institution canon places in the province was foreign-founded and none took root (lore: topics/guilds-and-orders.md §1). **Do not staff this faction with robed mages.** Its members are tree-minders, alchemists, grave-singers, *jekka-wats*, bone-workers and one or two foreign-trained scholars, and its central internal fight — beneath the Synod/College argument — is **whether it should become an institution at all**, since institutions are how the last lot lost everything. Its spine is the canon **Conclave of Baal at Stormhold**, the only body in Tamriel that can locate **Murkwood** (Elder Scrolls plus a specific ancient tablet): a quest-giver, a library and a dungeon key in one place.

**Ranks:** Copyist → Field Reader → Custodian → branch-aligned senior scholar. Advancement values scholarship, responsible field work, and knowing whose ruin it is.  

**Senior exclusions:** Synod, College and independent endings are mutually exclusive; publication choices can conflict with hardline Many-Root leadership.  

**World-generation summary:** One archive headquarters with wet/dry collections, guest laboratories, excavation camps and a small set of reusable Xanmeer/research sites.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| SA01 | A Book That Breathes Water | Recover a waterproofed text from an inhabited submerged ruin while respecting local ownership. Translation reveals a magical method, not treasure coordinates. | **P8/P9/P11/P12/P13:** Submerged shrine/house, air pockets, local custodian home and document socket; social and dive routes. | L07, L12, L24–L26; A01, A10, A20 |
| SA02 | Borrowed Memory | A scholar uses volunteered Hist-memory fragments but cannot prove consent survived translation. The player audits the method and affected participant. | **P11/P12/P13:** Archive laboratory, interview room, ritual pool and evidence apparatus; no new VFX beyond reusable memory shader. | L03, L24–L26; V09, A20 |
| SA03 | The Weight of a Name **(W2)** | An untranslated tablet identifies a modern family as descendants of an ancient office. Synod, College and local claimants each want a different reading. | **P11/P12/P13:** Tablet display, family home, hearing room and document variants. | L06–L07, L24–L26; A01, A20 |
| SA04 | The College at the Door | College of Whispers envoys offer spirit techniques and independence from Imperial bureaucracy while hiding a dangerous binding experiment — and a scholarly programme of exhuming Umbriel's dead from the Murkmire mud, which the College calls research and the marsh calls mass-grave desecration (lore: topics/guilds-and-orders.md §2). | **P11/P12/P13:** Guest laboratory, containment room and small magical encounter space. | L24, L26; V09, A20 |
| SA05 | Synod in the Cellar | The Synod offers funding, instruments and publication but demands exclusive custody of discoveries — artefact-hunting in a province of vakka stones, keystones and Mnemic Eggs. The archive's own records hold the counter-argument: Hierem, Umbriel's ritualist, was a Synod grandee (lore: topics/guilds-and-orders.md §2). | **P11/P12/P13:** Synod office, secure cellar, inventory/evidence sockets and negotiation scene. | L24–L25; V09, A20 |
| SA06 | A Dead Scholar’s Method | A murdered researcher’s notes can be reconstructed from field sites. The killer was protecting a community from a real but unethical experiment. | **P6/P11/P12/P13:** Two small field camps, scholar room, victim community and evidence chain; no identical token requirement—any 2 of 3 proofs suffice. | L03, L24–L26; A20, V09 |
| SA07 | A Ruin with Two Owners **(W2)** | An excavated Xanmeer is both a sacred site and a settlement’s source of building stone. Preservation, continued use and research have real costs. | **P10/P11/P12/P13:** Partially reused A01 ruin adjacent to village, quarry/work area, shrine and scholar camp; state variants for access/occupation. | L06–L07, L12, L24–L26; A01, A17, A20 |
| SA08 | The Experiment That Escaped | A magical construct or summoned creature has escaped into the waterways — and has already passed. The player reads its wake and damage at fixed breach points (a burst grate, boiled shallows, a drained fish-pen, dead eels) and chooses which containment point to hold; read the wake wrong and it must be met later, in a worse place. Destroy, capture or prove which institution caused it. | **P3/P8/P9/P13:** laboratory breach, 3–4 static breach-point sites with readable damage, two candidate containment endpoints (one right, one costlier), creature encounter; reuse existing creature/atronach asset. **Delivery D-B** — static intercepts, no pursuit AI. | L24–L26; V09, A13 |
| SA09 | Three Charters | Synod, College and independent scholars offer incompatible institutional futures. Earlier publications and ethical conduct change support. | **P11/P12:** Archive council hall and three offices; branch banners/NPC schedules only. | L24–L26; A20, V09 |
| SA10 | What We Publish | A discovery can delegitimise land claims and expose sacred information. The player chooses open archive, controlled local custody, Imperial institution, or secret suppression. | **P11/P14:** Archive final state variants, selected city reaction sockets, published/locked document sets and epilogue letters. | L06–L07, L24–L26; A01, A20 |

## 35. Nisswo of the Turning Path

**Type:** Major joinable religious/judicial faction  

**Premise:** A mainstream Argonian Sithis tradition focused on change, death, interpretation and community mediation, clearly distinct from the Unbound Root.  

**Themes:** Plural belief, grief, mercy, fraud, institutionalisation and the danger of making change into dogma.  

**Ranks:** Listener → Path-Bearer → Interpreter → regional teacher/itinerant elder depending outcome.  

**Senior exclusions:** A formal state-aligned ending conflicts with full Unbound Root sympathy and some Many-Root branches; lower membership remains broadly compatible.  

**World-generation summary:** Small shrines, funeral platforms, one debating house, travelling camps, prison/hearing spaces and reusable ritual props.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| NI01 | Ashes in Water | Two families dispute the correct funeral for a person who lived outside their birth community. The player learns that Nisswo practice is interpretive, not a rigid death cult. | **P11/P12/P13:** Funeral platform, family homes, water route and ritual prop sockets. | L04–L05, L33; A19–A20, V07 |
| NI02 | A Sermon with No Words | A silent Nisswo refuses to explain anything and simply **takes the player with her for a day**. The player must do what she does, in order, without being told why — and will get it wrong, publicly, at least twice, because the ritual's meaning is in the sequence. Participation, not observation. What the day was *for* is only clear at the end, and she still does not say it. | **P11/P12/P13:** Small shrine, a fixed six-stop route through market and households, prop-interaction sockets at each stop and two authored wrong-order outcomes. **Delivery D-A** — scripted prop interactions on a fixed route; no NPC schedule-watching. | L04–L05, L12; A15–A17 |
| NI03 | The Name Returned | A dead person’s name is being used to claim property and authority. The spiritual dispute hides a practical fraud. | **P11/P12/P13:** Civic records office, family shrine, disputed property and evidence sockets. | L04–L05, L16; A20, V12 |
| NI04 | The Sleepless Mourner | A mourner’s dreams may be grief, haunting or manipulation by a healer. Several compassionate outcomes remain possible. | **P11/P12/P13:** Home interior, healer room, grave/water site and reusable dream-light state. | L04–L05; V09, A20 |
| NI05 | Teeth of Sithis | The **Teeth of Sithis is a canon place**: the largest known Sithis temple in Murkmire, site of pre-Duskfall mass blood sacrifice, still tended by the Clutch of Nisswo. A violent sect — a splinter of the canon **Sul-Xan**, Naga cultists of Dagon as the "True Egg-Child of Sithis" who embrace only the cruellest beliefs — moves to retake it, claiming all destruction is sacred change. The player must distinguish sincere theology, criminal opportunism and state provocation; the Nisswo's nightmare precedent is canon too — High Priestess Shuxaltsei survived Duskfall as a vampire and once retook this temple (lore: topics/sithis-nisswo-shadowscales.md; tribes.md). | **P11/P12/P13:** `LOC murkmire.teeth_of_sithis` temple (tended, not ruined), sect camp, Nisswo debating hall and damaged public site; 3 small encounter/social routes. | L04–L05, L33; V03, A18 |
| NI06 | A Change Refused | A settlement leader uses tradition to prevent a widow, apprentice or immigrant from assuming a new role. Nisswo disagree over whether change must be permitted or earned. | **P4/P11/P12:** Settlement council, worksite and home schedules; branch NPC role swaps. | L04–L05, L12, L16; A15–A17 |
| NI07 | The False Nisswo | An admired travelling priest fabricates revelations but has also mediated real peace. Exposure may undo good outcomes. | **P4/P11/P13:** Pilgrimage route, camp, two reconciled communities and document/evidence sockets. | L04–L05; A15–A17, A20 |
| NI08 | The Shape of Mercy | A condemned murderer requests a ritual death while victims demand testimony and the state wants an example. The player chooses process, not a simple pardon/execute binary. | **P11/P12/P13:** Jail cell, hearing room, ritual site and victim homes; use a city jail — Blackrose Prison is a Blackguard-heir ruin, not a state institution (owner decision Q3). | L04–L05, L30; V06, A21–A22 |
| NI09 | Every Ending Is a Door | Rival Nisswo schools debate whether the order should remain dispersed or create a formal teaching house, risking dogma. | **P11/P12:** Nisswo gathering site, proposed school and regional delegate sockets. | L04–L05, L33; A15–A17, A20 |
| NI10 | The Turning Path | The player helps establish a plural network, formal school, itinerant tradition or deliberately dissolved order. They become respected interpreter, not unquestioned prophet. | **P11/P14:** One shrine/school with four local states; travelling-NPC schedules and rumour pools. | L04–L05, L33; A15–A17, A20 |

## 36. The Many-Root Conclave

**Type:** Major joinable Hist/community faction  

**Premise:** Tree-Minders and Hist communities mediate ecology, eggs, sap, roads and local autonomy without assuming all Hist speak with one voice. The line's rule of construction is **discover in danger, decide in council**: every hearing in it is the payoff of something won underwater, upriver or inside somebody's work camp, never the substance of the quest.  

**Themes:** Consent, stewardship, communal obligation, ecology and the limits of traditional authority.  

**Ranks:** Helper → Root-Walker → Community Mediator → branch-specific Conclave office.  

**Senior exclusions:** Hardline closed-community leadership conflicts with senior Open Water League office; plural/reform branches can coexist.  

**Set pieces** (dramatic-register certification, [00-overview.md](00-overview.md) §4): combat/monster — MR05's den in the abandoned grove; stealth/infiltration — MR04's night entry into the harvest camp, with an authored blown-cover escape; traversal — MR01's root-cave dive and MR02's storm boat run.  

**World-generation summary:** Several Hist-centred settlements, one neutral council grove, a flooded root-cave system, an egg nursery with a storm boat corridor, a night harvest camp, a half-drowned abandoned grove with a predator den, a drowned hamlet, road/root conflicts and small local state variants; Gideon content reuses `LOC gideon.hist_garden` and its Ayleid undercroft.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| MR01 | The Sick Root | A Hist is dying and the settlement blames upstream salt. The diagnosis is a dive: the grove's taproots run into flooded root-caves beneath the village — three sampling sites at increasing depth, air pockets in root hollows, parasite swarms between them. In the deepest chamber, a hand-cut breach decades old, with the founders' tool-marks still on it: the village's first families cut it to poison a rival grove, and their weapon has finally crept home. Each remedy benefits different residents and ecology; the council payoff chooses the cure — and whether the founders are named. | **P3/P8/P11/P13:** Hist settlement, flooded root-cave system with three sampling sockets, air pockets and breach evidence, healer workshop, and cure/naming local state variants. **Delivery D-A.** | L03, L12; A08, A10, A24, V01 |
| MR02 | Eggs Above the Flood | The nursery floods tonight. The player runs the threatened clutch out by boat through a drowning forest in the dark — fast open water where the storm hits hardest, or slow root channels where something hunts — and the two receiving communities' incompatible adoption terms must be answered at the far dock, standing in the boat with the eggs aboard. The flood is no accident: one receiving community opened a weir upstream to force exactly this adoption. | **P3/P9/P11/P13:** Egg nursery with rising-water states, night boat corridor with two authored route legs and fixed hazard points, upstream weir with evidence socket, two receiving docks and adult-caretaker NPCs; eggs are carried props — no child/egg bespoke animation. **Delivery D-B** — timed staged water states; hazards authored at fixed points. | L03, L12; A13, A15–A17, V07 |
| MR03 | The Borrowed Tree | Sited at **Gideon**: the majority-Lukiul city's Hist is a planted cutting in the city gardens among the Ayleid ruins, of disputed provenance, and Tuwul's Gloommire tribe claims it was taken without consent (owner decision Q9; lore: topics/hist-placement.md §3). The stakes are canon and severe: through **gloor**, the district's children now belong physically and spiritually to a tree the tribe says was stolen, and souls return to the tree they came from. Proving provenance means going under the garden: the planting crate and the original bill of passage lie in the flooded Ayleid undercroft below the courtyard, sealed since the planting — a night entry past the garden watch and a swim through the old drainage. What comes up is worse than theft: the cutting was **sold**, by a Gloommire faction in a famine year, paid in grain, and the tribe's memory has edited the sale out. The hearing is the payoff — what consent under famine is worth, said to Tuwul's face. | **P4/P8/P11/P12:** `LOC gideon.hist_garden` courtyard among the Ayleid ruins, flooded Ayleid undercroft with document cache and drainage swim, Gloommire tribal settlement and civic hearing room. | L03, L16; A10, A16–A17, A20, A24 |
| MR04 | Sap for Sale | Legal medicinal sap trade masks coercive harvesting — and the proof only exists at night, inside the concession's harvest camp, where Owing-held crews over-tap trees the daylight books say are rested. The player goes in as a hired hand or over the fence, documents the roster and the cuts, and gets out; blown cover turns the camp hostile along one authored escape route. The ledgers hold the reversal: the clinic campaigning loudest for a ban is the concession's biggest quiet buyer. Banning the trade harms patients; regulating it empowers the officials who enabled the abuse. | **P11/P12/P13:** Harvest camp with night-shift schedule, disguise-flag entry, roster and over-tapping evidence sockets and one authored escape route; sap workshop, clinic, warehouse and hearing space. **Delivery D-B** — disguise as flag; on blown cover, hostiles come to the player. | L03, L12, L30; A18–A20, V09 |
| MR05 | The Silent Clutch | Adults from one clutch share a recurring silence and fear, and exploiters sell them cures. The cause is neither curse nor disease: as hatchlings they were led by night to "listen" to a dying Hist their village had abandoned, and the youngest was left behind in the rising water. The abandoned grove is still there, half-drowned, and something dens in it now — nobody has gone back in twenty years, which is exactly what a den needs. The player clears or slips past the den and brings out what remains, and the truth with it: the itinerant curer is the eldest of the clutch, who led them out that night, and his prices are penance. The council decides what the clutch is told and what happens to him. | **P10/P11/P13:** Half-drowned abandoned grove with predator den and remains socket, family homes, curer's stall and council circle. | L03, L12; A07–A08, A15–A17, V01 |
| MR06 | Root Against Road | A causeway crucial to trade cuts living roots and burial ground — and while the parties argue, a span has just failed: the player arrives at the collapse, carts in the water, a teamster pinned under a beam with the tide coming in (a bounded timed rescue at one fixed point). Diving the wreck to read the failure finds fresh saw-marks on the root — cut from the *trade camp's* side: their own engineer was paid to force the expensive rerouting contract, with the ecology dispute as cover. Rerouting, bridging, seasonal closure and exposure all have costs, decided at the hearing with the saw in evidence. | **P3/P4/P6/P8/P11:** Road/root intersection with collapsed-span aftermath state, underwater cut-evidence socket, pinned-teamster rescue socket on a bounded timer, alternate boardwalk alignment, trade camp and cemetery; local route state variants only. **Delivery D-B** — aftermath, not staged collapse; one bounded timer. | L03, L17–L20; A10, A15–A17, A24, V01 |
| MR07 | The Tree That Chose Another | A Hist communicates more clearly with an outsider — a channel-digger — than with its appointed Tree-Minder, and the grove splits over what recognition means. A licensed night vigil settles it: the player takes the sap and the dream, and the dream is of water moving wrong. The tree has not chosen the outsider; it is *warning about him* — his new channel will drain the grove's aquifer — and only the Tree-Minder's jealousy read the attention as favour. Nobody wanted this answer, least of all the flattered outsider. Protect, redirect or suppress. | **P11/P12/P13:** Hist grove, vigil site with sap-dream sequence (existing interior with fog, lighting, audio and rearranged props — no new art), channel worksite and Tree-Minder home. | L03, L12; A16–A17, A24, V09 |
| MR08 | Council of Many Roots | The Conclave's great council cannot even convene: one delegation's boats are penned in by a creature denned across their channel, one is held at a brokerage toll with polite paperwork, and one refuses to come because the last council's minutes were falsified. The player clears the channel, breaks or buys the toll, and pulls the true minutes out of a flooded archive — and the minutes are the reversal: the same compact clause was staged and lost a generation ago, and every senior delegate knew. The council then sits as payoff, and the player must run its agenda by one procedure — Ixo-Vaal's binding compact or Kaska-Meen's bilateral accords. The unpicked desk reacts. | **P4/P9/P11/P12/P13:** Neutral council grove with 6–8 actor marks and private side paths (no mass gathering), denned channel encounter, brokerage toll point, flooded minute-archive with document socket, and procedure state variants. | L03, L12, L16; A08, A16–A17, A20, A24 |
| MR09 | The Price of Guidance | A respected Tree-Minder hid a flood warning to prevent panic, saved some people and sacrificed others — and the proof is written in stakes: the boundary markers she moved before the water came still stand on the ridge, mapping exactly whose homes she chose. The rest of the evidence lies in the drowned hamlet itself, a dive through the houses of the people who were not warned. The hearing that follows is staged entirely by survivors she saved — the sacrificed have no one left to demand justice — and that fact is the decision the player is actually being asked to make. | **P6/P8/P11/P13:** Drowned hamlet dive with household evidence sockets, ridge stake-line, settlement archive, hearing circle and survivor homes. | L03, L12; A10, A15–A17, A20 |
| MR10 | No Tree Owns the Marsh | Mid-ratification, a live test: a chartered crew is taking a cutting from a minor Hist *right now* — and their paper is genuine, issued in good order under the machinery the player's own mid-line choice built (a compact transfer writ, or a bilateral accord's trade clause). The new order's first product is a legal taking. The player reads tide tables and departure boards and makes the loading dock ahead of the boat; read the water wrong and the cutting sails, and the finale's politics harden. Then the council: honour the paper or burn your own instrument, and resolve the Conclave into local-autonomy network, central ecological authority, open civic body or dissolution into bilateral accords. | **P4/P9/P11/P14:** Loading-dock static intercept keyed to a shared timer with scheduled-boat access, council grove final states, delegate schedules, selected road/sap service changes and epilogue notices. **Delivery D-B** — manhunt conversion; static intercept, no moving quarry craft. | L03, L12, L16; A13, A16–A17, A24 |

## 37. The Reed-Sail Compact

**Type:** Major joinable transport/labour faction  

**Premise:** Pilots, ferries, boat crews, smugglers and dock workers control the routes that make Argonia function.  

**Themes:** Mobility, labour, monopoly, sacred routes, smuggling and the line between mutual aid and cartel power.  

**Ranks:** Deckhand → Pilot → Route-Keeper → branch-specific Compact officer.  

**Senior exclusions:** Pirate/cartel leadership conflicts with Marsh Charter auxiliary command and public League law office.  

**World-generation summary:** Several docks, one guildhouse, working ferry routes, a pirate cove/ship, toll station and Archon harbour rescue scenario.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| RS01 | Earn Your Pole | The player qualifies on a working ferry route, handling current, passengers and a staged obstruction rather than a combat test. | **P3/P8/P9/P11:** D1 ferry corridor, two docks, passenger marks and boat-control tutorial hooks. | L17–L20; A13, V07 |
| RS02 | Ferry in the Dark | A night ferry carries someone hunted by both law and criminals. The player chooses route, concealment and whether to ask why. Pursuit is expressed as **fixed watcher boats at chokepoints** — moored or holding station, lanterns sweeping — that the player evades by route choice, timing and dousing lights, never as chasing AI. | **P8/P9/P11/P13:** Night boat corridor, alternate landing, reed hiding pocket and 2–3 static watcher-boat positions with detection cones. | L17–L20; A12–A13, V07 |
| RS03 | Cargo with a Pulse | A sealed crate contains a living creature being trafficked for alchemy. Releasing it risks passengers and local ecology. | **P9/P11/P13:** Cargo boat, warehouse, healer/alchemist site and creature-release habitat. | L12, L17–L20; A07–A09, A13, A19 |
| RS04 | The Drowned Toll | An official toll station sinks financially, not physically: guards and pilots collude to create a private tariff. The Compact can reform or capture it. | **P11/P12/P13:** Toll station, office, dock, ledger and patrol schedules. | L17–L20; A13, A19–A20 |
| RS05 | Pirates of Topal | A pirate crew includes former ferry workers displaced by a monopoly. Boarding, negotiation, sabotage and rescue remain viable. | **P8/P9/P11/P13:** Coastal boat route, pirate cove/ship, boarding arena and hidden landing. | L01; A09, A11–A13, A19 |
| RS06 | Broken Pilots **(W2)** | Several veteran pilots deliberately give wrong directions. They are resisting a map registry they believe will expose sacred routes. | **P4/P11/P12:** Pilot guildhouse, map office and three route-marker sites; dialogue/evidence focus. | L17–L20; A20, V07 |
| RS07 | Storm at Archon | A severe storm traps ships outside Archon. The player allocates limited rescue capacity among passenger, cargo and military vessels — and on the wall, Ahnjazzi's Archon correspondent reads her manifest-pricing letter aloud over the wind (she never leaves Soulrest; her letters sound exactly like her), telling everyone what each hull is worth and what each life is, which is a thing she can do without being a monster and for which nobody thanks the reader. | **P3/P8/P9/P11/P13/P14:** Archon harbour, **3 statically moored/grounded craft at fixed positions** (no vessel simulation, no AI navigation in weather), storm water profile, boat-trip timer, rescue markers and low actor counts; survivors are parented props until landed. **Delivery D-B.** | L01; A11–A13, V07 |
| RS08 | A Chain Across the River **(W2)** | A merchant coalition proposes a physical chain and monopoly checkpoint. It promises safety and threatens free movement. | **P3/P11/P13:** River chokepoint, chain/boom asset, fort/toll office and alternate shallow channel. | L17–L20; A13, A21, V06–V07 |
| RS09 | Compact or Cartel | Pilots, smugglers, workers and owners force an internal election after violence. The player’s methods determine which votes remain legitimate. | **P11/P12:** Compact hall, dock assembly and private bargaining rooms; branch schedules. | L17–L20; A14, A19 |
| RS10 | Open Channels | The organisation becomes worker compact, merchant cartel, pirate confederation or regulated public ferry service. | **P4/P9/P11/P14:** Dock/boat service variants across 3–4 hubs; no geometry changes beyond banners, schedules and service availability. | L17–L20; A11–A14, V07 |

## 38. The League of Open Water

**Type:** Major joinable civic faction  

**Premise:** Lukiul, mixed-city citizens, merchants, workers and reformers seek civic standing independent of tribal or Hist affiliation.  

**Themes:** Citizenship, property, plural identity, public services and the risk that openness becomes rule by wealth.  

**Ranks:** Petitioner → Advocate → Ward Delegate → charter branch office.  

**Senior exclusions:** Senior public office conflicts with oligarchic Thieves leadership and pirate/cartel Reed-Sail leadership.  

**World-generation summary:** A League hall, civic registry/court, mixed neighbourhood, market/warehouse, empty ward and canal-project state variants.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| LW01 | Citizen of No Hist | A resident denied civic registration because no local Hist claims them asks the League for help. Records, prejudice and real security concerns intersect — and canon supplies a remedy that sharpens rather than solves it: **Hissmir's Trials of the Burnished Scales** let the Hist-less commune with the Hist, and its Root Stewards cannot refuse a comer; but the trials are a three-day ordeal in a distant xanmeer, and the registry says a pilgrimage certificate is not proof (lore: regions/shadowfen.md; topics/hist-and-sap.md). | **P4/P11/P12/P13:** Civic registry, claimant home, An-Xileel office and hearing room; references `LOC shadowfen.hissmir` and its Root Stewards (see 20-world-provisions canon-location table). | L02–L03, L16; A20, V12 |
| LW02 | The House Register | A property census will regularise ownership but erase informal occupants and old communal rights. | **P11/P12/P13:** Mixed urban block, records office and 5–6 household sockets; local ownership variants. | L16; A15, A19–A20, V12 |
| LW03 | Bread and Salt **(W2)** | Food shortages are blamed on outsiders while merchants warehouse supplies. Releasing stock helps immediately but may collapse future deliveries. | **P11/P12/P13:** Market, warehouse, dock and ration queue scene marks. | L16; A19–A20, V07 |
| LW04 | The Murdered Delegate | A civic delegate’s killing appears ethnic, but the victim was exposing League financiers — Advocate Oshu-Kai among them. Several groups benefit from a simple hate-crime narrative. The climax is physical but **not a chase**: the killer bolts, and the player wins by **cutting him off**, choosing which canal gate to drop or which boat to take to reach one of three fixed intercepts before he does. Guess wrong and he is gone, and the case survives on weaker evidence. The live pursuit in this quest is the player being hunted *on the way back* with the witness — hostiles chasing the player, which the engine already does. | **P11/P12/P13:** Delegate home, murder site, League office, three static intercept points with a shared timer, one closable gate, evidence chain and a return route with pursuing hostiles. **Delivery D-B.** *(Was "the player pursues across rooftops and canals" — a fleeing NPC over the most complex geometry in the game.)* | L16; A18–A20, V12 |
| LW05 | Trial by Water | A traditional ordeal is demanded in a mixed city court. The player can challenge, adapt, exploit or defend it. | **P8/P11/P12:** Court, ritual water basin and medical/rescue positions; race-neutral alternate mechanics. | L12, L16; A17, V12 |
| LW06 | The Empty Ward **(W2)** | A district evacuated after disease remains legally occupied by absent owners. Refugees move in; speculators want clearance. | **P11/P12/P13:** Empty urban ward with 2–3 occupancy states, clinic and property records. | L14, L16; A15, A18–A20 |
| LW07 | A Vote Bought Twice | Two blocs bribe the same electors using different definitions of corruption. The player can expose all, choose a reform coalition or manipulate the vote. | **P11/P12/P13:** Council hall, tavern, counting house and private meeting routes. | L16; A19–A20, V12 |
| LW08 | The Public Canal | A canal project improves sanitation and trade but cuts a sacred route and displaces households. Design alternatives cost money and access. | **P3/P11:** Static canal/boardwalk alternatives pre-authored as 2–3 local states; affected homes, shrine and works camp. | L03, L16–L20; A15, A17, V07 |
| LW09 | The Open Water Charter | League reformers, merchants and An-Xileel-aligned civic officers negotiate a new charter. Prior cases control credible clauses. | **P11/P12:** Large but compact civic chamber, private caucus rooms and charter display. | L02, L16; A20, V12 |
| LW10 | Who Counts as Argonian? | The League becomes plural civic movement, merchant oligarchy, regulated municipal service or collapses after exposing its own contradictions. | **P11/P14:** League hall and selected district state swaps; officeholders, services and epilogue documents. | L02–L03, L16; A19–A20, V12 |

---

# Part VIII — Compact and regional faction lines

## 39. Blackrose Chainbreakers

*(Rewritten by the lore pass, 2026-08-25. The line previously fought "informal
bondage" — a real but shapeless target. It now fights a named institution:
**the Owing**. Full dossier: `world/sources/lore/topics/labour-and-bondage.md`.)*

**What the Owing is.** Argonia in 4E 201 has no courts, no treasury and no
prisons it will admit to. Its **sentence is not a cell but an obligation of
work**, counted in **nushmeekos** — the canon month of "hard thankless work" —
assessed by an arbitrator, worked off, and then by custom never mentioned again.
It is native, it is humane in origin, and where it works Argonians will defend it
at length to any foreigner who asks.

**What went wrong** is four small drifts, none of them requiring a villain: with
the Shadowscale *ku-vastei* arbiters dying out and the Nisswo doctrinally unable
to standardise anything, **assessment drifted to whoever holds the crossing, the
estate or the hiring office** — largely the ex-Archein families, canon's "pompous,
assimilated slaver kleptocrats", who kept the ledgers and changed only their
letterhead. Owings then became **transferable** (sold on), **extendable**
(spoilage, sickness, the debtor's own food), and **heritable in fact** (the
household consumed the benefit). A person can now be born owing, worked far from
home, sold twice, and never once be described as a slave by anyone, including
themselves.

**The tell is free and it is canon.** An Argonian's morphology comes from their
Hist's *gloor*, and **traits fade with distance from the tree and return on
coming home**. Anyone held in a long Owing is **visibly washed out** — colour
thinned, tribal markings gone soft. The injustice is legible across a dock before
a word of dialogue, at the cost of one material variant. And because souls return
to the Hist, a debtor who dies far from theirs may not get home — which is
exactly the problem the funerary rite answers. **The Chainbreakers' burial work
and their abolition work are the same work.**

**The Rose is not the enemy and never was.** Blackrose Prison is a ruin reoccupied
by the Blackguards' heirs — prison-born families three generations deep, with
Umbriel's undead below and a claim to their own legitimacy (owner decision Q3).
It keeps its own internal ledger, so it is *implicated*, which is much better
than being the villain.

**Register.** The Owing is deliberately uneven. Most interior villages run it as
intended and resent the suggestion otherwise; Helstrom barely uses it; Gideon's is
paper-clean and contestable in a functioning courthouse; Thorn's saltrice country
is the worst of it. Never write it as universal, and **always give it defenders it
has genuinely served**.

**Protected across every end-state** (§30b): `blackrose.archive_wing`, the
confiscation-ledger record class and the Rose's heirs as a community survive
all Chainbreaker outcomes — and this is the movement's own doctrine, not an
external constraint: the *proof* of the Owing must survive to indict it.
Burning means burning Owing paper, never the archive of what was done. MQ09
acknowledges a completed Chainbreaker line
([30-main-quest.md](30-main-quest.md)).

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| BC01 | Four Months for a Boat | A worker's Owing was assessed at four nushmeekos for a boat she damaged. It has now run eleven years, and the arithmetic is *correct at every step* — food, a broken season, a fever, the boat's replacement, interest on the replacement. Nobody committed a crime. Never-Sold's method is to prove the arithmetic in front of the man who did it, which does not free her, because the arithmetic is not the problem. | P11/P12/P13: ex-Archein estate work quarters, ledger office, toll-crossing route, witness schedules; a readable multi-page account the player can actually check. | L30; V06, A18, A20 |
| BC02 | Names Scratched Out | The Rose's fire-damaged registers and the estate ledgers are **the same class of document**, and reading them is how the Chainbreakers find people currently held. The burnt pages conceal political detainees and ordinary violent offenders together — and the Blackguard heirs' claim to their own legitimacy rests on which reading survives. | P11/P12/P13: burnt archive wing in the Rose (`blackrose.archive_wing` is tier-0-owned, §30b — readings and copies change hands; the wing and its record class survive every outcome), duplicate record store, cross-referenceable estate ledger set and descendant-family contact locations. | L30; A20–A22 |
| BC03 | The Broker’s Mercy | Ussa-Rekh forgave debts for thirty years and freed the trapped — and built the brokerage that now indentures the Soulrest and Archon dock crews. He keeps every forgiven ledger, bound, and presents it to the freed as a gift; some treasure it and some burn it in front of him. Innocents owe him their freedom; others their chains; and he can tell you the exact year it turned. | P11/P12/P13: broker home, hiring office, freed-person safehouse and hearing room. | L30; V06, A20 |
| BC04 | Riot Without a Banner | An uprising is being prepared inside the Rose by factions with incompatible aims — prison-born families under Third-Born Xeekh, newcomers with nowhere else, and those who want the undead levels opened. Prevention preserves a hierarchy that is abusive and is also the only thing feeding four hundred people. | P11/P12/P13: the Rose's inhabited yard, occupied cell blocks, armory, medical room and 2–3 local states; **actor cap 6 active**; the violence is met as *aftermath* in at least one state variant rather than staged live. Every riot outcome leaves the archive wing, its record class and the heir community standing (§30b). | L30; A21–A22, V06 |
| BC05 | Bones to the Dirt | White Rose Prison stands abandoned in the western burn country, full of Argonian dead who never got home — most of them people who died mid-Owing, far from their Hist. Grave-Singer Ossu carries them, by name, from the stakes, talking to them the whole way. Every estate, toll-holder and hierarchy the Chainbreakers have crossed has a reason to stop the procession, and stopping a funeral is a thing even their enemies find hard to do in daylight. | P10/P11/P12/P13: `LOC whiterose.prison_ruin`, bone-store cells, **procession route with contested crossings** (the tolls are the obstacle and the argument), burial ground. **Delivery D-B**: the procession moves on a waypoint leash, is invulnerable in transit, and its cost is expressed in which crossings open. | L30; A20–A22, V06 |
| BC06 | What the Rose Becomes | Four ends, and the interesting ones are not about the Rose: recognise the Rose community's legitimacy; disperse it — as a hierarchy, never as a people (every end preserves the heirs as a community, the archive wing and the confiscation-ledger record class, §30b); raise a memorial over the undead levels; or **turn the campaign on assessment itself** — a Nisswo witness required at every Owing, transfer forbidden, extension capped. The last is unglamorous, probably correct, achievable only through Gideon's courthouse, and leaves the province with less than it had — and it is a **Gideon-charter local reform**: it binds assessment where Gideon's writ runs and spreads only by adoption, rewriting no province-wide Owing law and never touching the Reed's record-erasure mechanic. | P11/P14: Rose banner/occupant/service variants, estate and toll state swaps, Gideon courthouse charter state, and epilogue notices only. | L02, L30; V06, A21–A22 |

## 40. Thorn Ash-Reed Accord

Argonian and Dunmer residents attempt to contain border violence without erasing slavery, invasion or living claims. **Diversification note (2026-08-25):** the line previously ran five consecutive quests about commemorating the past — a memorial, a killing, a property claim, retaliation lists, an accord. TA03 is now the **saltrice title question**, which is about the present, is economic rather than ethnic, and cuts *across* the Argonian/Dunmer line rather than along it: canon puts temperate grassland and saltrice plantations here, and at the secession the fields passed to whoever was standing in them.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| TA01 | The Memorial with Two Dates | Two communities commemorate different atrocities at the same site. | P4/P11/P13: Thorn memorial square, archive and family homes. | L01, L13; V05, A20 |
| TA02 | A Body on the Ferry | A murder appears political; the victim was trafficking evidence and people — moving Owing-held labourers across the border as freight. Ends as a **manhunt, not a chase** (owner directive 2026-08-26): the partner has already fled down the border channels; the player reads departure boards, pilots' gossip and the tide, uses the scheduled ferry network to reach the likely landing first, and confronts them at a static intercept — capture, kill or bargained escape. Read the tide wrong and they slip to a second, harder intercept. | P9/P11/P13: ferry, dock, morgue, two suspect neighbourhoods, two static intercept landings on the border channels keyed to a shared timer, and scheduled-ferry access. **Delivery D-A.** | L13, L16; A13, A19 |
| TA03 | Whoever Was Standing In Them | The saltrice fields have no titles, only occupation. Field-Holder Uxa-Meen — a freed labourer's granddaughter — holds hers, and works them with Argonian and Dunmer labour under **Owings** assessed by the ex-Archein family that used to manage them for the Dres. Both militias want the question settled their way; both are the wrong shape for it, because the ledger does not care who anybody's grandparents were. The player can force a title, force an audit, broker a division, or let it stand. | P11/P12/P13: saltrice fields and drying floor, the old managers' counting house, labourers' quarters with **washed-out** workers, and a boundary nobody has walked in forty years. | L01, L13, L16; V05, A19–A20 |
| TA04 | The Retaliation List | Both militias maintain lists of civilians to seize if fighting starts. | P11/P12/P13: two militia rooms, safehouse routes and evacuation scene sockets. | L01, L13; A03–A05, V05 |
| TA05 | Ash-Reed Accord | Create truth commission, security pact, closed separation or factional victory. | P11/P14: Thorn council and neighbourhood guard/schedule variants. | L01, L13, L16; V05 |

## 41. Umbriel Witness Society

**Inheritors and archivists, not survivors**: 153 years and human-like Argonian lifespans mean nobody alive saw Umbriel — anyone claiming to remember it is lying, mistaken, or not what they seem, and that is itself a usable hook. Descendants, scholars and political actors fight over the truth of Lilmoth's 4E 48 catastrophe at the emotional distance of inherited history: argued about, politicised, taught badly, and occasionally shrugged at by the young (owner trauma directive; lore: extrapolation/argonia-4e201-state.md §9).

**Desks:** Keeps-The-Count at the Society's Lilmoth archive room; **Neexa-Tul** (Jel name, 50s), keeper of the descendants' room behind a Pusbottom chandlery, where families deposit and reclaim their own accounts — her ethic is that the dead belong to their families, not to archives or memorials: testimony may be consulted, never kept. **Quirk:** before reading anyone else's account you must write one line of your own family's into her ledger; the book of strangers' single lines is the best thing in the room. And Old Nusa at Deepmire, at the end of the UW04 road. Full cast in [36-cast-roster.md](36-cast-roster.md) §56.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| UW01 | A Voice Recorded Twice | Two witness texts contradict because one was edited after death. | P11/P12/P13: archive, family home and scribe workshop. | L14–L15; A20 |
| UW02 | The Sleeping Hist Fragment | A recovered sap sample is treated as evidence, relic and hazard. | P11/P12/P13: secure archive lab, shrine and debate room. | L03, L14–L15; V09, A20 |
| UW03 | Pusbottom’s Missing House | A vanished household was omitted from all official casualty lists. | P8/P11/P12/P13: submerged dwelling, municipal records and descendant home. | L14–L16; A10, A18–A20 |
| UW04 | The Refuge | The province's real Umbriel memorial is not in a city. It is at **Deepmire — "the Refuge"** — a cursed plateau even locals avoid, where Murkmire's survivors sheltered while the island passed overhead, tended ever since by a caretaker few (canon; provisioned in [20-world-provisions.md](20-world-provisions.md) §12b). Getting there is a D4 expedition through swamp-leviathan bone country, and what waits at the end is **Old Nusa**, who is bored of Umbriel and will say so — and a memorial the Society wants to catalogue, the Nisswo want to let go, and the caretakers want left exactly as it is. Also in the caretakers' cache: proof that the **Witness Society's own founding testimony** — the celebrated victim account its archive and public standing are built on — came from a collaborator who assisted Hierem's agents, so what UW05 publishes, protects or seals now includes the Society itself. | P10/P11/P12/P13: `LOC deepmire.refuge` plateau approach and xanmeer/bone terrain, memorial ground, caretakers' camp, document cache; **the line's one traversal spike** — a D4 route with shelters, in a line otherwise made of archives. | L02, L14–L15; A01, A17, A20, V04 |
| UW05 | The Public Record | Publish full archive, protected testimony, official narrative or sealed evidence. | P11/P14: museum/archive state variants and city rumour pools. | L02, L14–L15; A20 |

## 42. Rootworm Waykeepers

A small but vital order maintains rootworm routes, arguing over access, safety and sacred knowledge. Two rules govern everything in it. **The worm is never seen on screen** — a permanent design rule, not an asset fallback: its presence reads through effects (a tunnel mouth, displaced water, a wake, a sound, the pen's disturbed surface), and even "a worm refusing a route" is read from behaviourless evidence. And **the root-transit network is provisional**: the current four-station layout is a Pass-1 placeholder re-authored with Hist-node placement at world Phase 11; these briefs are finalized in that packet's co-design loop, and no quest may assume station positions before then. The line runs on **two desks by declared canon exception** ([36-cast-roster.md](36-cast-roster.md) §56): the order is a handful of keepers on routes that are secret by doctrine — Ki-Ossa at the Helstrom terminus and Tuxo at the hidden station are the only fixed posts it can afford, and the restrictionist third voice speaks through Ki-Ossa. Every RW05 end-state keeps the Helstrom terminus in service (§30b).

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| RW01 | The Worm That Refused | A rootworm will not take a familiar route; handlers disagree whether the cause is injury, roots or human violence — and the refusal is read entirely from behaviourless evidence, no worm in sight: the pen's disturbed surface, an untouched feed, the tunnel mouth it will not pass. | P9/P11/P13: rootworm station, service cavern with refusal-evidence sockets and alternate destination; no creature on screen. | L19–L20; A24, V04 |
| RW02 | Passenger Without a Name | A wanted traveller seeks transit under an obsolete sanctuary custom. | P11/P12/P13: waiting hall, private pen (reads as occupied — churned water, sound — never a visible worm), records and exit routes. | L19–L20; A20 |
| RW03 | The Shortcut Sold | A Waykeeper sells a sacred route to smugglers while funding repairs the state refused. | P9/P11/P13: hidden station, smuggler cache and damaged route chamber. | L19–L20; A18, A24 |
| RW04 | A Mouth Too Narrow | A route can be reopened only by cutting living roots or abandoning a dependent settlement. | P6/P9/P11: blocked root tunnel, settlement and alternate ferry route; 2 local states. | L03, L19–L20; A13, A24 |
| RW05 | The Waykeepers’ Oath | Choose open public service, restricted sacred order, state transport bureau or dispersed local keepers. | P4/P9/P11/P14: station service/schedule variants across 3 nodes; all four end-states keep the Helstrom terminus in service (§30b). | L03, L19–L20; A24 |

## 43. The Salt-Teeth arc — Reed-Sail pirate branch

Piracy is written as a **branch arc inside the Reed-Sail Compact**, not a separate line: Reed-Sail already contains a pirate crew encounter (RS05), a pirate/cartel senior branch and a pirate-confederation ending (RS10), so a standalone pirate faction would duplicate locations (cove, ships, Soulrest harbour), themes and a finale choice that Reed-Sail resolves anyway. One shared line with a criminal branch is cheaper to validate and dramatically stronger than two thin ones.

The Salt-Teeth quests and where they live:

| ID | Quest | Home |
|---|---|---|
| ST01 | A Flag with No Ship | Reed-Sail pirate-branch quest, unlocked by choosing the outlaw path after RS05; the crew whose flag is stolen is the RS05 crew. |
| ST02 | The Honest Prize | Reed-Sail pirate-branch quest following ST01. |
| ST03 | Mutiny at Low Tide | Reed-Sail pirate-branch quest; its outcome determines who leads the crew into RS09–RS10. |
| ST04 | Black Sails at Soulrest | A **standalone** Soulrest quest (LQ-class); it works without pirate membership and gives non-pirate players the premise. |
| ST05 | Teeth or Tide | Expressed through RS10's pirate-confederation ending rather than a separate finale. |

The pirate branch (ST01→ST02→ST03) is a wave-2 addition to Reed-Sail; RS10's pirate ending remains reachable at Milestone 1 through the base line.

