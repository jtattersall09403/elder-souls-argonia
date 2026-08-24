# Factions — system, eight major lines, compact lines

> Module of the quest/narrative master plan (see [README](README.md)).

# Part VI — Faction system

## 27. Faction principles

Major factions should feel like institutions rather than personal quest dispensers.

Each line requires:

- ordinary work before the central conspiracy;
- at least three recurring patrons or internal tendencies;
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

They should not:

- require main-quest completion;
- replace main-quest actors;
- determine the main ending solely through membership;
- have their entire leadership rewritten by main-quest state;
- force every player to complete them.

---

# Part VII — Eight major faction questlines

## Faction depth tiers

All eight lines below are designed to their full shape, but production depth is staged:

- **Deep at Milestone 1 (10–12 quests):** Shadowscales, Night-Reed Chapter, Nisswo of the Turning Path, Many-Root Conclave. These four are the most Argonia-distinctive — the content no other Elder Scrolls game could contain — and carry the province's identity. They ship complete.
- **Standard at Milestone 1 (6–8 quests, extendable to 8–10):** Marsh Charter, Sunken Archive, Reed-Sail Compact, League of Open Water. Their quest tables below mark with **(W2)** the entries deferred to the second content wave; each line's opening arc, mid-line spike and finale ship in Milestone 1 so no faction feels truncated.

The deferral principle: cut breadth before depth, and never defer a line's finale.

## 31. The Empty Cradle — Shadowscales

**Type:** Major joinable  

**Premise:** A contested attempt to revive an order that Skyrim’s Veezara calls extinct. Canon dates the collapse precisely: the Archon training facility was shut down in **4E 187**, and the **last known living Shadowscale dies in 4E 201** — the year of play. The Dark Brotherhood's Cheydinhal Listener, **Alisanne Dupre**, and a member named **Rasha** already planned to revive the facility in response to the Brotherhood's decline — a canon-named external bidder with a canon-named motive. And the **Black-Tongues (Kota-Vimleel)**, who dedicate almost all their resources to producing Shadowscales, have had nowhere to send Shadow-born hatchlings for fourteen years; what they have done with them instead is the line's strongest unclaimed hook (lore: topics/sithis-nisswo-shadowscales.md; archon.md). The line asks whether birth, tradition, state power or consent can recreate the Shadowscales.  

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
| SS05 | A Brother from Falkreath | A Dark Brotherhood emissary offers training, contracts and Listener legitimacy in exchange for absorption — executing the revival Listener Dupre and Rasha planned from Cheydinhal before the Brotherhood's own collapse (lore: topics/sithis-nisswo-shadowscales.md). The emissary is useful, courteous and plainly seeking control. | **P11/P12/P13:** Guest safehouse, ritual chamber and discreet dock/escape; 4-actor negotiation marks. | L09, L29; A02, V03 |
| SS06 | The Honest Target | A contract names a corrupt magistrate, but the patron is a smuggler trying to erase a conviction. Bonus conditions reward discovery and restraint, not one prescribed kill method. | **P11/P12/P13:** Magistrate courthouse/home, smuggler warehouse, patrol schedules, poison/stealth/social approaches and evidence sockets. | L08–L09; A18–A20, V02–V03 |
| SS07 | Two Knives, One Name | Two assassins use the same Shadowscale title. One is an impostor; the other committed an atrocity under a genuine writ. Authenticity and innocence diverge. | **P11/P12/P13:** Twin safehouses, staged pursuit path, interrogation room and fail-forward journals. | L08–L09; A02, V03 |
| SS08 | The State’s Hand | The Veiled Reed offers an official charter: legal protection and resources in return for state-directed contracts. It is the third bidder — after the Brotherhood (SS05) and the Black-Tongues (SS04) — for an order everyone wants and nobody made. Refusal leaves the order vulnerable but independent. | **P11/P12:** An-Xileel office, Shadowscale council chamber and branch-specific banner/guard state only. | L02, L08–L09; A02–A03 |
| SS09 | No Listener in Black Marsh | A ritual meant to contact the Night Mother yields ambiguous evidence and a staged deception. The player can bind the order to the Brotherhood, expose the fraud, or adopt a local non-mystical charter. | **P12/P13:** Ritual sanctuary, coffin/crypt, acoustic/lighting variants, secret observer route and one compact combat space. | L08–L09, L29; A02, A20, V03 |
| SS10 | Shadow at Dawn | The surviving claimants force a final choice: state service, Brotherhood affiliation, independent ethical order, or dissolution with records returned to victims. | **P11/P12/P14:** One shared headquarters with four local end states; NPC schedule swaps, contract board variants and epilogue letters. | L02, L08–L09, L29; A02–A03, V03 |

## 32. Night-Reed Chapter — Thieves Guild

**Type:** Major joinable  

**Premise:** A **native** criminal organisation, not a Cyrodiilic franchise: canon's Thieves Guild runs along provincial lines with little coordination, and no Imperial chapter ever took root in Argonia — the native precedents are Pusbottom, Alten Corimont, the Blackguards and the tribeless Naga (lore: topics/guilds-and-orders.md §3). The Night-Reed is the organisation a Cyrodiilic guild would recognise as a peer, adapted to canals, boats, flooded districts and rootworm routes. The line escalates from local theft to a province-famous heist.  

**Themes:** Skill, loyalty, urban dispossession, professional restraint, criminal mutual aid and the seduction of blackmail power.  

**Ranks:** Lookout → Cutpurse → Water-Rat → Night-Reed → senior branch outcome. No compulsory Nocturnal oath.  

**Senior exclusions:** Senior criminal-oligarch leadership conflicts with public League office; a redistributive guild can coexist with lower League rank but not its law-enforcement branch.  

**World-generation summary:** Prioritise Soulrest and Lilmoth docks, a reusable guild den, connected rooftops/canals/sewers, several target interiors and the large Tidal Palace heist complex.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| TG01 | A Dry Hand in a Wet City | The player proves value by recovering stolen property without harming the thief who took it from another thief. Observation and social leverage beat burglary alone. | **P11/P12/P13:** `LOC soulrest.night_reed_den`; dockside tavern, back rooms, roof and canal exit; small target house with 3 approaches. | L28; V02, A18–A20 |
| TG02 | The Drowned Lockbox | A lockbox lies in a recently sunk counting house. Three clients claim it; the contents reveal that none told the whole truth. | **P3/P8/P9/P12/P13:** Submerged counting-house interior, air pocket, street entrance, underwater escape and fixed ownership evidence. | L01, L28; A10, A18, A20 |
| TG03 | Honest Customs | Customs officers run an illegal tariff while a smuggler uses the scandal to move captives. The guild can steal the tariff ledger, expose both, or take over the route. | **P11/P12/P13:** Customs house, holding cellar, dock patrol schedules, boat route and evidence sockets. | L16, L28; V02, V07, A13, A18–A20 |
| TG04 | The House That Floats | A wealthy home is periodically moved between moorings. The burglary becomes a navigation and timing problem with optional social entry and underwater hull access. | **P9/P11/P12/P14:** Fixed staged houseboat at three static moorings selected by schedule/state swap — the "simulated moving route" option is explicitly dropped as engine-scope risk; deck/interior/hull portals; actor schedules and low-cost state swaps. | L17–L20, L28; A11–A14, V07 |
| TG05 | A Fence in Every Port | Candidate fences in Soulrest, Lilmoth and Archon compete. The player investigates reliability and hidden loyalties rather than delivering arbitrary quotas. | **P4/P11/P12:** Three small shops and safe rooms with stable IDs; route graph; branch-specific merchant availability. | L28; A19–A20, V02 |
| TG06 | The Rootworm Robbery | The guild plans to intercept a sealed state packet during rootworm transit. Choices include impersonation, route diversion, bribing Waykeepers or stealing after arrival. | **P4/P9/P11/P12/P13:** Rootworm station at both ends, service tunnel, passenger/waiting area and sealed packet sockets; no need to simulate travel interior continuously. | L19–L20, L28; A20, A24 |
| TG07 | The Informer’s Cut | Someone is selling guild routes. Suspects have plausible motives; the apparent informer is protecting people from a guild officer’s violent scheme. | **P11/P12/P13:** Guild den subrooms, three suspect homes, surveillance perches and staged accusation scene. | L28; V02, A18–A20 |
| TG08 | The Vault Beneath Pusbottom | A preliminary heist into a flooded municipal vault teaches route planning: rooftop, sewer, underwater cistern or forged maintenance order. | **P8/P9/P11/P12/P13:** `LOC lilmoth.pusbottom_vault`; four entrances converging on one vault, patrol routes, locks, water and no-kill bonus. | L14–L16, L28; V02, A10, A18–A20 |
| TG09 | Tools of the Grand Heist | The player chooses two of four preparations—inside schedule, breathing charm, forged seal, or portable counterweight—each opening an optional route. None is a mandatory fetch chain. | **P11/P12/P13:** Four compact preparation locations already causal in the city; tool sockets and route flags; allow direct difficult heist without preparations. | L28; V02, V09, A19–A20 |
| TG10 | The Palace Below the Tide | The major heist targets Lilmoth’s Crown Ledger and treasury. It crosses public reception rooms, roofs, service canals, sewers, an underwater cistern and a guarded archive. One canon security system: **ripper eels trained to hunt canal-crossers**, which do not attack anyone who has rubbed themselves with eel-slime — a known, obtainable, revolting counter (lore: topics/ecology-encounters-loot.md §2). Methods remain player-chosen. | **P8/P9/P10/P11/P12/P13/P14:** `LOC lilmoth.tidal_palace`; connected multi-route heist complex, patrol schedule, disguise/social checkpoints, ripper-eel canal hazard with eel-slime counter, treasury, ledger, vault and boat escape; 60–90 minute target. | L14–L16, L28; V02, V07, V11–V12, A10, A18–A20 |
| TG11 | Who Owns the Night? | The ledger proves that guild patrons, merchants and officials jointly engineered housing seizures. The player can expose it, sell it, redistribute wealth, or use it to build a disciplined criminal oligarchy. | **P11/P14:** Shared guild hall with four end states; merchant/fence schedules, selected property/NPC changes and epilogue notices only. | L14–L16, L28; A19–A20, V02 |

## 33. The Marsh Charter — Fighters Guild tradition

**Type:** Major joinable  

**Premise:** A Black Marsh mercenary/protection institution tracing legitimacy to the Fighters Guild while operating through boats, forts and village contracts.  

**Themes:** Professional competence, public service, ecology, exploitation and whether violence can be responsibly chartered.  

**Ranks:** Recruit → Proven Blade → Contract Captain → charter branch office. Promotions require combat or tactical competence plus sponsors.  

**Senior exclusions:** An-Xileel auxiliary ending conflicts with pirate/cartel Reed-Sail leadership; public-service ending can coexist with most civic factions.  

**World-generation summary:** One main guildhall/training yard, one reusable frontier fort, villages with defence sockets, fixed creature habitats and contract boards.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| FG01 | A Contract in Mud | A straightforward settlement-defence contract reveals that the employer understated the danger and overcharged residents. | **P4/P11/P13:** D1 village, palisade, creature approach lanes, contract office and aftermath NPC sockets. | L27; A04–A08, V01 |
| FG02 | The Missing Patrol | A patrol vanished after refusing a charter officer’s unsafe order. Tracks, equipment and survivor testimony reveal negligence, not a monster ambush. | **P6/P13:** D2 marsh patrol route, evidence trail, survivor shelter and small predator territory. | L21, L27; A07–A08, V01 |
| FG03 | Wamasu Season | A juvenile Wamasu threatens farms because hunters killed its prey and stole eggs. Options include killing, relocating, returning eggs or exposing trophy hunters. | **P3/P4/P9/P13:** D2/D3 wetland territory, nest, farm edge, boat access and large-creature combat arena. | L12, L27; A06, A13, V01 |
| FG04 | The Beast in the Ledger **(W2)** | The guild has billed several villages for the same slain creature. The player investigates forged trophies and staged attacks. | **P11/P12/P13:** Guild records room, tax office, butcher/trophy store and two villages with evidence sockets. | L27; A20, V12 |
| FG05 | A Fort Paid Twice **(W2)** | Two communities financed the same fort restoration and both expect protection. The commander plans to abandon the poorer settlement. | **P11/P12/P13:** Reusable frontier fort, two road/water approaches, barracks and council scenes; guard assignment state variants. | L01, L27; V06, A19 |
| FG06 | Mercy for a Monster | A supposedly man-eating Argonian transformed by disease retains reason intermittently. Healers, victims and guild officers disagree on cure, containment and execution. | **P11/P12/P13:** Quarantine hut, healer space, victim homes and secure encounter room; use existing humanoid/creature assets, no bespoke transformation. | L12, L27; V09, A07 |
| FG07 | The Price of Protection | Local officers encourage bandits to keep villages dependent on guild contracts. The player can expose, seize or redirect the racket. | **P4/P11/P12/P13:** Roadside bandit camp with causal trade-route placement, guild office, village and ambush route. | L27; V06, A04–A05 |
| FG08 | Charter War | Reformers and mercenary captains compete for the guild charter. Demonstrated skill, sponsorship and prior conduct determine who follows the player. | **P11/P12:** Guildhall meeting floor, training yard, records archive and branch banners; no city battle. | L27; A04–A05, V06 |
| FG09 | The Contract No One Signed | A lucrative extermination order targets a marsh community that never requested help. The real client wants their land and water access. | **P4/P11/P13:** Remote D3 community, disputed resource site, client estate and non-hostile/hostile encounter configurations. | L01, L16, L27; A15–A17, V12 |
| FG10 | No Master of Arms | The player resolves the guild as public-service charter, disciplined mercenary company, An-Xileel auxiliary, or broken protection cartel. Rank depends on martial competence and decisions. | **P11/P14:** One guildhall with four local states; patrol/contract board swaps and settlement letters. | L02, L27; A03–A05, V06 |

## 34. The Sunken Archive

**Type:** Major joinable magical/scholarly faction  

**Premise:** Black Marsh scholars operate between local custodians, the Synod and College of Whispers after the Mages Guild’s dissolution. Canon leaves Argonia with **no resident magical institutions at all** (the Synod had no presence within ~400 miles of Lilmoth), so both foreign bodies work through intermediaries, each with a distinct canon motive: the **Synod** hunts artefacts of power (its declared 4E 201 project), and the **College of Whispers** — canon's open necromancers with the best Umbriel intelligence — seeks **Umbriel's dead**, which from the Argonian side is grave desecration on a mass-grave scale; it is the province's most legible foreign magical antagonist. And the minister who performed the Umbriel ritual, **Hierem**, was a Synod member with "vast influence" over it — a fact the Veiled Reed's records would hold, and a permanent Argonian reason to refuse the Synod anything (lore: topics/guilds-and-orders.md §2).  

**Themes:** Ownership of knowledge, research ethics, translation, foreign institutions and the political force of archives.  

**Ranks:** Copyist → Field Reader → Custodian → branch-aligned senior scholar. Advancement values magic, scholarship and responsible field work.  

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
| SA08 | The Experiment That Escaped | A magical construct or summoned creature escapes into waterways. The player can destroy, capture or prove which institution caused it. | **P3/P8/P9/P13:** Canal pursuit path, laboratory breach, creature encounter and containment endpoint; reuse existing creature/atronach asset. | L24–L26; V09, A13 |
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
| NI02 | A Sermon with No Words | A silent Nisswo refuses to explain a ritual, forcing observation of community practice and consequences. | **P11/P12/P13:** Small shrine, market/household observation points and event schedule. | L04–L05, L12; A15–A17 |
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

**Premise:** Tree-Minders and Hist communities mediate ecology, eggs, sap, roads and local autonomy without assuming all Hist speak with one voice.  

**Themes:** Consent, stewardship, communal obligation, ecology and the limits of traditional authority.  

**Ranks:** Helper → Root-Walker → Community Mediator → branch-specific Conclave office.  

**Senior exclusions:** Hardline closed-community leadership conflicts with senior Open Water League office; plural/reform branches can coexist.  

**World-generation summary:** Several Hist-centred settlements, one neutral council grove, nurseries, sap workshops, road/root conflicts and small local state variants.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| MR01 | The Sick Root | A Hist’s illness comes from salt intrusion, parasites and careless harvesting. Each remedy benefits different residents and ecology. | **P3/P4/P8/P11/P13:** Hist settlement, root/soil/water sampling sockets, healer workshop and local state variants. | L03, L12; A17, A24–A25, V01 |
| MR02 | Eggs Above the Flood | A clutch must be moved from a threatened nursery, but two safer communities attach different obligations to adoption. | **P3/P11/P12/P13:** Egg nursery, two receiving settlements, boat route and adult-caretaker NPCs; avoid child/egg bespoke animation. | L03, L12; A15–A17, V07 |
| MR03 | The Borrowed Tree | Sited at **Gideon**: the majority-Lukiul city's Hist is a planted cutting in the city gardens among the Ayleid ruins, of disputed provenance, and a Gloommire tribe claims it was taken without consent (owner decision Q9; lore: topics/hist-placement.md §3). The stakes are canon and severe: through **gloor**, the district's children now belong physically and spiritually to a tree the tribe says was stolen, and souls return to the tree they came from. Precedent runs both ways — the Blackwood Company smuggled a whole Hist to Leyawiin; the Veeskhleel perpetuate themselves by stealing eggs (lore: topics/hist-and-sap.md). | **P4/P11/P12:** `LOC gideon.hist_garden` courtyard among the Ayleid ruins, Gloommire tribal settlement and civic hearing room. | L03, L16; A16–A17, A24 |
| MR04 | Sap for Sale | Legal medicinal sap trade masks coercive harvesting. Banning it harms patients; regulation empowers officials who enabled abuse. | **P11/P12/P13:** Sap workshop, clinic, warehouse and harvesting site with evidence sockets. | L03, L12; A19–A20, V09 |
| MR05 | The Silent Clutch | Adults from one clutch share a recurring silence and fear. The cause is social trauma, not magical curse, though exploiters sell cures. | **P11/P12/P13:** Family homes, healer stall, ritual site and dialogue-focused scene spaces. | L03, L12; A15–A17 |
| MR06 | Root Against Road | A causeway crucial to trade cuts living roots and burial ground. Rerouting, bridging, seasonal closure and forced construction all have costs. | **P3/P4/P6/P11:** Road/root intersection, alternate boardwalk alignment, trade camp and cemetery; local route state variants only. | L03, L17–L20; A15–A17, A24, V01 |
| MR07 | The Tree That Chose Another | A Hist begins communicating more clearly with an outsider than its appointed Tree-Minder. The player decides whether to protect, test or suppress the relationship. | **P11/P12/P13:** Hist grove, Tree-Minder home, outsider worksite and private meeting spots. | L03, L12; A16–A17, A24 |
| MR08 | Council of Many Roots | Delegates seek shared rules for sap, eggs, roads and outsiders. Consensus is impossible; a workable compact requires accepting losses. | **P4/P11/P12:** Neutral council grove with 6–8 actor marks and private side paths; no mass gathering. | L03, L12, L16; A16–A17, A24 |
| MR09 | The Price of Guidance | A respected Tree-Minder hid a warning to prevent panic and saved some people while sacrificing others. Justice and future trust conflict. | **P11/P12/P13:** Settlement archive, disaster site, hearing circle and survivor homes. | L03, L12; A15–A17, A20 |
| MR10 | No Tree Owns the Marsh | The Conclave becomes local-autonomy network, central ecological authority, open civic body or dissolves into bilateral accords. | **P11/P14:** Council grove final states, delegate schedules, selected road/sap service changes and epilogue notices. | L03, L12, L16; A16–A17, A24 |

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
| RS02 | Ferry in the Dark | A night ferry carries someone hunted by both law and criminals. The player chooses route, concealment and whether to ask why. | **P8/P9/P11/P13:** Night boat corridor, alternate landing, reed hiding pocket and pursuit boat sockets. | L17–L20; A12–A13, V07 |
| RS03 | Cargo with a Pulse | A sealed crate contains a living creature being trafficked for alchemy. Releasing it risks passengers and local ecology. | **P9/P11/P13:** Cargo boat, warehouse, healer/alchemist site and creature-release habitat. | L12, L17–L20; A07–A09, A13, A19 |
| RS04 | The Drowned Toll | An official toll station sinks financially, not physically: guards and pilots collude to create a private tariff. The Compact can reform or capture it. | **P11/P12/P13:** Toll station, office, dock, ledger and patrol schedules. | L17–L20; A13, A19–A20 |
| RS05 | Pirates of Topal | A pirate crew includes former ferry workers displaced by a monopoly. Boarding, negotiation, sabotage and rescue remain viable. | **P8/P9/P11/P13:** Coastal boat route, pirate cove/ship, boarding arena and hidden landing. | L01; A09, A11–A13, A19 |
| RS06 | Broken Pilots **(W2)** | Several veteran pilots deliberately give wrong directions. They are resisting a map registry they believe will expose sacred routes. | **P4/P11/P12:** Pilot guildhouse, map office and three route-marker sites; dialogue/evidence focus. | L17–L20; A20, V07 |
| RS07 | Storm at Archon | A severe storm traps ships outside Archon. The player allocates limited rescue capacity among passenger, cargo and military vessels. | **P3/P8/P9/P11/P13/P14:** Archon harbour, 3 distressed craft positions, storm water profile, rescue markers and low actor counts. | L01; A11–A13, V07 |
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
| LW04 | The Murdered Delegate | A civic delegate’s killing appears ethnic, but the victim was exposing League financiers. Several groups benefit from a simple hate-crime narrative. The investigation climaxes physically: the hired killer bolts when confronted, and the player pursues across rooftops and canals — taking them alive preserves the strongest evidence. | **P11/P12/P13:** Delegate home, murder site, League office, suspect routes, rooftop/canal pursuit path and evidence chain. | L16; A18–A20, V12 |
| LW05 | Trial by Water | A traditional ordeal is demanded in a mixed city court. The player can challenge, adapt, exploit or defend it. | **P8/P11/P12:** Court, ritual water basin and medical/rescue positions; race-neutral alternate mechanics. | L12, L16; A17, V12 |
| LW06 | The Empty Ward **(W2)** | A district evacuated after disease remains legally occupied by absent owners. Refugees move in; speculators want clearance. | **P11/P12/P13:** Empty urban ward with 2–3 occupancy states, clinic and property records. | L14, L16; A15, A18–A20 |
| LW07 | A Vote Bought Twice | Two blocs bribe the same electors using different definitions of corruption. The player can expose all, choose a reform coalition or manipulate the vote. | **P11/P12/P13:** Council hall, tavern, counting house and private meeting routes. | L16; A19–A20, V12 |
| LW08 | The Public Canal | A canal project improves sanitation and trade but cuts a sacred route and displaces households. Design alternatives cost money and access. | **P3/P11:** Static canal/boardwalk alternatives pre-authored as 2–3 local states; affected homes, shrine and works camp. | L03, L16–L20; A15, A17, V07 |
| LW09 | The Open Water Charter | League reformers, merchants and An-Xileel-aligned civic officers negotiate a new charter. Prior cases control credible clauses. | **P11/P12:** Large but compact civic chamber, private caucus rooms and charter display. | L02, L16; A20, V12 |
| LW10 | Who Counts as Argonian? | The League becomes plural civic movement, merchant oligarchy, regulated municipal service or collapses after exposing its own contradictions. | **P11/P14:** League hall and selected district state swaps; officeholders, services and epilogue documents. | L02–L03, L16; A19–A20, V12 |

---

# Part VIII — Compact and regional faction lines

## 39. Blackrose Chainbreakers

Blackrose Prison is **not a working prison and not the state's**: it is a ruin reoccupied by the **Blackguards' heirs** — prison-born families three generations deep, with Umbriel's undead in the lower levels and a claim to their own legitimacy (owner decision Q3; lore: topics/prisons.md). What the Chainbreakers oppose is therefore **informal bondage**: debt servitude on the ex-Archein estates, tolled crossings that trap people, indentured dock labour, and the Rose's own prison-born hierarchy — diffuse, deniable, and much harder to abolish than a building (owner decision Q7; lore: extrapolation/settlement-register.md §6). Their deepest obligation is canon: Argonians who died in stone prisons "such as White Rose" can still return **if their bones are brought to the dirt**.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| BC01 | The Cell Left Open | A debt-bound worker vanishes from an ex-Archein estate: escaped, sold on down the tolled crossings, or dead. The ledger says the debt transferred with them. | P11/P12/P13: estate work quarters, debt ledger office, toll-crossing route and witness schedules. | L30; V06, A18, A20 |
| BC02 | Names Scratched Out | The Rose's fire-damaged registers conceal political detainees and ordinary violent offenders together — and the Blackguard heirs' claim to their own legitimacy rests on which reading survives. | P11/P12/P13: burnt archive wing in the Rose, duplicate record store and descendant-family contact locations. | L30; A20–A22 |
| BC03 | The Broker’s Mercy | A respected labour broker quietly forgave debts and freed the trapped — while building the network that now indentures dock crews. Innocents owe him their freedom; others their chains. | P11/P12/P13: broker home, hiring office, freed-person safehouse and hearing room. | L30; V06, A20 |
| BC04 | Riot Without a Banner | An uprising is being prepared inside the Rose by factions with incompatible aims — prison-born families, newcomers with nowhere else, and those who want the undead levels opened; prevention may preserve the hierarchy's abuse. | P11/P12/P13: the Rose's inhabited yard, occupied cell blocks, armory, medical room and 2–3 local states; actor cap. | L30; A21–A22, V06 |
| BC05 | Bones to the Dirt | White Rose Prison stands abandoned in the western burn country, full of Argonian dead who never got home. Bringing their bones to the dirt is the Chainbreakers' most sacred work — and every estate, toll and hierarchy they have crossed has a reason to stop the procession (canon: Argonians who died away from the Hist can return if their bones reach the dirt; lore: topics/prisons.md). | P10/P11/P12/P13: `LOC whiterose.prison_ruin`, bone-store cells, procession route with contested crossings and burial ground. | L30; A20–A22, V06 |
| BC06 | What the Rose Becomes | Choose among recognition of the Rose community's legitimacy, its dispersal, a memorial over the undead levels, or a campaign that turns on the estates and tolls instead. | P11/P14: Rose banner/occupant/service variants, estate and toll state swaps, and epilogue notices only. | L02, L30; V06, A21–A22 |

## 40. Thorn Ash-Reed Accord

Argonian and Dunmer residents attempt to contain border violence without erasing slavery, invasion or living claims.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| TA01 | The Memorial with Two Dates | Two communities commemorate different atrocities at the same site. | P4/P11/P13: Thorn memorial square, archive and family homes. | L01, L13; V05, A20 |
| TA02 | A Body on the Ferry | A murder appears political; the victim was trafficking evidence and people. Ends in a night boat pursuit of the trafficker's partner through border channels, with capture, sinking or bargained escape all possible. | P9/P11/P13: ferry, dock, morgue, two suspect neighbourhoods and a night pursuit channel with alternate landing. | L13, L16; A13, A19 |
| TA03 | House Without Ash | A Dunmer refugee family claims property once used by slavers; Argonian descendants contest it. | P11/P12/P13: disputed house, court and old cellar/records. | L01, L13, L16; V05, A20 |
| TA04 | The Retaliation List | Both militias maintain lists of civilians to seize if fighting starts. | P11/P12/P13: two militia rooms, safehouse routes and evacuation scene sockets. | L01, L13; A03–A05, V05 |
| TA05 | Ash-Reed Accord | Create truth commission, security pact, closed separation or factional victory. | P11/P14: Thorn council and neighbourhood guard/schedule variants. | L01, L13, L16; V05 |

## 41. Umbriel Witness Society

**Inheritors and archivists, not survivors**: 153 years and human-like Argonian lifespans mean nobody alive saw Umbriel — anyone claiming to remember it is lying, mistaken, or not what they seem, and that is itself a usable hook. Descendants, scholars and political actors fight over the truth of Lilmoth's 4E 48 catastrophe at the emotional distance of inherited history: argued about, politicised, taught badly, and occasionally shrugged at by the young (owner trauma directive; lore: extrapolation/argonia-4e201-state.md §9).

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| UW01 | A Voice Recorded Twice | Two witness texts contradict because one was edited after death. | P11/P12/P13: archive, family home and scribe workshop. | L14–L15; A20 |
| UW02 | The Sleeping Hist Fragment | A recovered sap sample is treated as evidence, relic and hazard. | P11/P12/P13: secure archive lab, shrine and debate room. | L03, L14–L15; V09, A20 |
| UW03 | Pusbottom’s Missing House | A vanished household was omitted from all official casualty lists. | P8/P11/P12/P13: submerged dwelling, municipal records and descendant home. | L14–L16; A10, A18–A20 |
| UW04 | The Useful Martyr | A political movement built its legitimacy around a victim who helped the conspiracy. | P11/P12/P13: memorial, headquarters and hidden document cache. | L02, L14–L15; A20 |
| UW05 | The Public Record | Publish full archive, protected testimony, official narrative or sealed evidence. | P11/P14: museum/archive state variants and city rumour pools. | L02, L14–L15; A20 |

## 42. Rootworm Waykeepers

A small but vital order maintains rootworm routes, arguing over access, safety and sacred knowledge.

| ID | Quest | Narrative/choice | World-generation provision | Lore/assets |
|---|---|---|---|---|
| RW01 | The Worm That Refused | A rootworm will not take a familiar route; handlers disagree whether the cause is injury, roots or human violence. | P9/P11/P13: rootworm station, service cavern and alternate destination. | L19–L20; A24, V04 |
| RW02 | Passenger Without a Name | A wanted traveller seeks transit under an obsolete sanctuary custom. | P11/P12/P13: waiting hall, private pen, records and exit routes. | L19–L20; A20 |
| RW03 | The Shortcut Sold | A Waykeeper sells a sacred route to smugglers while funding repairs the state refused. | P9/P11/P13: hidden station, smuggler cache and damaged route chamber. | L19–L20; A18, A24 |
| RW04 | A Mouth Too Narrow | A route can be reopened only by cutting living roots or abandoning a dependent settlement. | P6/P9/P11: blocked root tunnel, settlement and alternate ferry route; 2 local states. | L03, L19–L20; A13, A24 |
| RW05 | The Waykeepers’ Oath | Choose open public service, restricted sacred order, state transport bureau or dispersed local keepers. | P4/P9/P11/P14: station service/schedule variants across 3 nodes. | L03, L19–L20; A24 |

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

