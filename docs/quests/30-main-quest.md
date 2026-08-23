# Main quest: The Eye and the Root — structure, cast, endings

> Module of the quest/narrative master plan (see [README](README.md)).

# Part IV — Main quest: _The Eye and the Root_

## 16. Story thesis

The story asks:

> **Can a people be protected by a bond they are not free to refuse?**

Supporting questions:

- Does the state’s use of sacred institutions invalidate the institutions themselves?
- Is severance liberation when communities depend upon what is being severed?
- Who may interpret the will of the Hist?
- Can an intelligence service defend sovereignty without defining dissent as disloyalty?
- Does an outsider or legally dead prisoner become neutral, exploitable, or uniquely dangerous?
- Is a treasure important because of what it does, or because people believe it grants legitimacy?
- What does Sithis require when every faction claims change on its own terms?

## 17. Fan inspiration and transformation

The principal fan-story inspiration is Matthew Aaron Evans’s Gamesas pitch, which proposed:

- a treasure hunt for the Eye of Argonia;
- affected Hist;
- an interior Sithis cult;
- conflict involving the An-Xileel;
- Helstrom and the Lost City as the culmination.

The game should credit Evans in its community-inspiration references if this core is retained.

Additional credited fan interpretations shape the Eye:

- Valerie Marie: the Eye as a king’s jewel and instrument of political legitimacy;
- Matt Gammond: the Eye as cipher/translator/puzzle key;
- Soraya Davy: the Eye as a perceptive “third eye”;
- FirDaus LOVe farhana: the Eye as translator and diplomatic/perceptual device.

The design departs from the fan pitch in four deliberate ways: no Imperial Expeditionary Force in the main quest, Helstrom separated from the Lost City, “rogue trees” recast as deliberate finite acts of ritual interference, and every consequence constrained to feasible static-world implementation.

## 18. Stakes

The Unbound Root has tested methods for making selected Hist withdraw, fall silent or reject established intermediaries. Its final ritual would act at the Root of Accord in the Lost City.

If the cult succeeds:

- several influential Hist communities lose established communication and ritual continuity;
- egg, adoption, burial and identity practices become uncertain;
- An-Xileel authority suffers a legitimacy crisis;
- some Lukiul and rootless residents experience genuine liberation from coercive classification;
- other communities experience the act as spiritual mutilation;
- violence and opportunism follow;
- the Unbound Root gains ideological momentum but cannot control all consequences.

If the Veiled Reed obtains exclusive control:

- the immediate attack is prevented;
- warning, records and coordination remain;
- state surveillance and classification become harder to challenge;
- dissenting communities may be pressured into continued participation.

The hard-to-achieve reform outcome preserves the living accord while removing state-only controls and restoring periodic local consent. It requires evidence, allies and optional work across the questline.

## 19. Main cast

| Character | Public role | Private drive and contradiction | Branch potential |
|---|---|---|---|
| **Nesh-Deeka** | Veiled Reed field handler and records investigator | Believes records expose power; has altered records to protect operations and people. **Design note:** Nesh-Deeka is the game's Caius Cosades — the one personal, idiosyncratic relationship in an institutional cast. She should have visible private habits, an unofficial residence, unguarded opinions about her superiors, and dialogue that treats the player as a person before an asset. The player's feelings about the Veiled Reed should largely *be* their feelings about her. | loyal handler, reform ally, state propagandist, dead witness with documentary fallback |
| **Holds-the-Reed** | Director of the Veiled Reed | Protects sovereignty and has stopped real threats; treats secrecy and classification as necessities without natural limits | loyal patron, authoritarian opponent, constitutional officer, casualty or disgraced official |
| **Speaks-in-Reeds** | Nisswo interpreter in Helstrom | Defends plural interpretation but enjoys the influence that ambiguity gives him | neutral mediator, reform ally, compromised priest or martyr |
| **Moss-Beneath-Stars** | Helstrom Tree-Minder | Protects Hist/community autonomy; will override individuals when she believes collective survival demands it | guide, Conclave ally, paternalistic opponent or wounded authority |
| **Opens-the-Last-Door** | Cult recruiter and philosopher | Has suffered genuine state abuse and believes only radical severance creates freedom; rationalises cult experiments. **Design note:** they operate through Act II under the pseudonym **“the Collector”** — a courteous rival treasure-hunter the player repeatedly encounters during the Eye hunt (MQ07, MQ10 or MQ13, MQ14). Their unmasking at the MQ18 sermon is the questline's first personal twist, seeded across four quests at zero extra asset cost. | confidant, manipulator, reluctant dissident or final cult representative |
| **Cuts-the-Old-Knot** | Leader of the Unbound Root; former Veiled Reed operative | Exposed compulsory use of the Accord and concluded reform is impossible; willing to impose liberation on non-consenting communities | cult leader, defeatable ideologue, tragic ally or absent architect whose writings survive |
| **Walks-Against-Current** | Pilot/Waykeeper contact | Values survival and route freedom over ideology; has carried state prisoners and cult fugitives. **Design note:** the recurring boat pilot for the Act II coastal leads (MQ10, MQ13, MQ14) and a candidate expedition guide in MQ27–MQ28, so the player enters the endgame with one non-institutional relationship whose fate matters. | boat guide, Compact liaison, betrayer or independent rescuer |
| **Sings-Over-Stone** | Helstrom archivist | Knows the Eye has been deliberately mythologised; protects information through selective silence | treasure-hunt mentor, reform witness or custodian who hides the Eye |
| **The Last Warden** | Ancient Wamasu guardian of the sanctuary | Bound to protect the Accord’s consent conditions, not any modern faction | shared final boss; optional weakening/non-lethal route if records are understood |

All names are working names and need individual style/knowledge sheets before dialogue production.

## 20. Branch-state model

Use a small, inspectable set of variables:

```ts
interface MainQuestPoliticalState {
  veiledReedTrust: number;      // 0–100
  unboundRootTrust: number;     // 0–100
  coverIntegrity: number;       // 0–100
  publicKnowledge: number;      // 0–100
  eyeCustody: "player" | "reed" | "cult" | "shared" | "hidden";
  accordEvidence: Set<string>;
  affectedHistOutcomes: Record<string, string>;
  expeditionSupport: Set<string>;
}
```

Do not fork the world into separate campaigns. Roughly 75–85% of locations and stages remain shared.

### Practical paths

1. **Veiled Reed loyalist** — honest reports, cult sabotage, state expedition.
2. **Loyal infiltrator/reformer** — remains formally loyal while gathering evidence and building safeguards.
3. **Unbound Root double agent** — falsifies reports, preserves cult assets and enables the Unbinding.
4. **Independent witness** — protects the Eye and plays both organisations against one another.
5. **Failed double agent** — cover collapses; progress continues through force, Nisswo help or documentary routes with reduced options.

The player is never forced to select “join cult” from a conspicuous menu. Loyalty is expressed through what they report, preserve, destroy, reveal and whom they save.

## 21. Main-quest structure and world requirements

The line contains 32 core quests. Several Act II investigations are optional: four of six regional leads are sufficient to locate the Eye, while omitted leads remain available as side investigations and may unlock better routes or ending evidence.

| ID | Quest | Danger | Narrative and choice | World-generation provision | Lore/assets |
|---|---|---|---|---|---|
| MQ01 | No Name on the Work Roll | D0–D1 | Character creation occurs during processing on a penal work barge near Alten Corimont. The player can cooperate, remain silent or antagonise staff without acquiring a fixed biography. | **P2/P4/P11/P12/P13:** `LOC opening.work_barge` and `opening.work_camp`; prison-processing interior; confiscated-property container; 6–8 NPC schedule/scene marks; managed-marsh escape perimeter; fixed prisoner/guard loot. | L13, L17–L20; V06, V07, A13, A21–A22 |
| MQ02 | When the Reeds Opened | D1 | An Unbound Root cell attacks an An-Xileel courier attached to the work detail. A nearby Hist withdraws from its attendants as the camp collapses into mutiny, fire and shallow-water escape. The player chooses one witness to save. | **P3/P6/P7/P8/P9/P11/P13/P14:** Shallow channels, reed cover, one climbable root route, one rowboat escape and one combat route; `STATE opening.camp={orderly,attacked,aftermath}`; witness rescue sockets; 2–3 small encounter spaces; no terrain deformation. | L03–L05, L23; V01, V07, A07–A08, A13, A24 |
| MQ03 | A Dead Prisoner’s Use | D1 | At a guarded river station, survivors reconstruct the attack. Nesh-Deeka of the Veiled Reed notes that the destroyed roll makes the player legally dead and politically unconnected—useful qualities for a deniable investigator. A conditional pardon begins the main quest. | **P4/P11/P12/P13:** `LOC stormhold.river_station`; interview room, infirmary and evidence table; three mutually exclusive witness survivors with documentary fallbacks; Veiled Reed contact office and fast-travel handoff. | L02, L13; V06, V12, A19–A20 |
| MQ04 | The Tree That Turned Its Face | D1–D2 | The player investigates the first affected Hist community. Disease, sabotage, grief and deliberate ritual interference overlap. The solution can expose the cell, protect an innocent Tree-Minder, or let An-Xileel officers impose emergency control. | **P3/P4/P6/P8/P10/P11/P13:** `LOC shadowfen.hist_settlement_01`; healthy/withdrawn local Hist presentation using lighting/audio/particles only; ritual pool, sap-workshop, NPC homes, evidence sockets and three approaches; `STATE hist01={withdrawn,guarded,reconciled}`. | L03–L05, L12–L13, L23; V01, V04, A16–A17, A24–A25 |
| MQ05 | Helstrom Behind the Thorns | D0 city / D5 exterior | The Veiled Reed transports the player to Helstrom by escorted fast boat convoy up the guarded marsh channels (the solved Alten Corimont–Helstrom waterway). The city is safe and active; guards and residents make the surrounding basin’s lethality explicit. Mainstream Nisswo and Tree-Minders dispute what happened at the first Hist. | **P2/P4/P9/P11/P12/P14:** `FAST boat.stormhold_helstrom` (escorted convoy on the AC–Helstrom channel); safe `LOC helstrom.inner_city`; convoy dock and guarded boat-station interiors at both ends; city gates opening directly toward D5 but with warnings, not invisible walls; faction offices, lodging, markets and recurring council chamber. | L05, L19–L22, L32–L33; A15–A17, A19–A20, A24 |
| MQ06 | The Jewel Nobody Has Seen | D0 | A Helstrom archive contains incompatible descriptions of the Eye of Argonia. The Veiled Reed wants it found before the cult; Nisswo doubt that ownership can settle sacred questions. The player chooses which account becomes the first public lead. | **P10/P11/P12/P13:** `LOC helstrom.archive`; document shelves, projection/display table and secure store; six lore-document sockets; one compact staged debate; reusable Eye prop from an existing gem/amulet mesh. | L10–L11, L05–L07; V09, A01, A20 |
| MQ07 | The First False Eye | D0–D2 | A counterfeit Eye is being sold to rival buyers. The player can infiltrate the sale, publicly expose it, steal it, or let a buyer take it so the Veiled Reed can follow them. The false object hides a genuine route cipher. Among the bidders is a courteous, well-informed collector who withdraws at the last moment and leaves the player a polite note — the first appearance of “the Collector” (Opens-the-Last-Door under cover). | **P4/P11/P12/P13:** `LOC stormhold.floating_auction_house`; public floor, private office, roof/boat exit and underwater mooring route; buyer NPC schedules; auction state variants; fixed evidence and theft sockets. | L10–L11; V02, V07, A13–A14, A19–A20 |
| MQ08 | The Unbound Root | D2 | Following the counterfeit leads to a cult safehouse. Evidence reveals an organised movement claiming that the Hist–Argonian bond has been converted into political captivity. The player meets no final leader yet and can conceal selected evidence from the Veiled Reed. | **P11/P12/P13:** `LOC shadowfen.cult_safehouse_01`; marsh house, cellar shrine and concealed boat exit; evidence board; non-lethal infiltration route; `STATE cult_cell01={active,abandoned,raided}`. | L03–L06, L22–L23, L33; A15–A17, A20, V03 |
| MQ09 | The Map Beneath the Prison | D2 | Blackrose’s old confiscation ledgers show that an explorer carrying an Eye route-tablet died in custody. The records can be obtained by legal archive access, prisoner contacts, burglary or an underwater maintenance passage. Any illicit route can go loud: a raised alarm turns the exit into a timed escape through flooding maintenance tunnels with warders behind and a lockdown ahead — dangerous, survivable, and never mandatory. | **P2/P4/P8/P9/P11/P12/P13:** `LOC blackrose.archive_wing`, prison yard and submerged maintenance tunnel; cell/office/records interiors; multiple access permissions; inmate schedules; no mandatory prison riot; fixed map-tablet item. | L30, L10–L11; V06, V10, A18, A20–A22 |
| MQ10 | The Auction of Drowned Things | D1–D2 | At Soulrest, salvage from a wreck includes a lens-frame matching the cipher. Merchants, a Khajiit broker, customs officers and wreck divers all have credible claims. The player can negotiate, dive first, stage a theft or expose the wreck’s real ownership. The Collector is already in the city asking the same questions; if the player delays or fails, the lens-frame surfaces later in cult hands and the lead is recovered by harder means. Walks-Against-Current is the natural pilot for the dive. | **P3/P4/P8/P9/P11/P12/P13:** `LOC soulrest.salvage_market` and `poi.wreck_eye_lens`; dock market, warehouse, swimmable wreck, air pockets and boat chase corridor; ownership evidence sockets; 2 local market state variants. | L01, L10–L11; V07, V10, A09–A14, A19–A20 |
| MQ11 | The Surveyor’s Lie | D1–D2 | A Gideon estate preserves an Imperial survey whose neat roads deliberately omit a forbidden marsh corridor. The surveyor’s descendant, estate workers and an An-Xileel land office each hold part of the truth. | **P2/P4/P11/P12/P13:** `LOC gideon.survey_estate`, land office and omitted roadside shrine; manor, archive cellar, workers’ quarters and field route; stealth/social/legal approaches; historic map overlay as evidence. | L01–L02, L16–L18; V06, V12, A19–A20 |
| MQ12 | Ash Written in Water | D2–D3 | Near Thorn, a Dunmer family’s water-damaged slave-road journal contains a phonetic rendering of a Lost City route-name. Argonian veterans and Dunmer residents dispute whether the record should be preserved, tried as evidence, or destroyed. | **P2/P4/P8/P11/P12/P13:** `LOC thorn.border_archive` and `poi.slave_road_memorial`; mixed neighbourhood, flooded cellar, memorial and D3 road segment; hearing scene; evidence and grave sockets; no large battle. | L01, L13, L16; V05, V12, A19–A20 |
| MQ13 | Pusbottom Remembers | D1–D2 | A half-sunken Lilmoth district contains an Umbriel-era property register and a pre-Umbriel rubbing of an Eye symbol. Recovering it means navigating occupied homes, civic claims and submerged municipal tunnels—not looting an empty ruin. Mid-quest reversal: the rubbing has already been cut from the register by a resident paid by the Collector; the player must trace the buyer chain and either intercept the handoff or bargain with the cult’s courier, producing the questline’s first direct (and deniable) contact with the Unbound Root since MQ08. | **P2/P3/P8/P9/P11/P12/P13:** `LOC lilmoth.pusbottom` with inhabited raised streets and submerged lower level; municipal archive, cistern and 3 portal routes; residents with ownership claims; water-safe evidence containers. | L14–L16; V02, V07, A10, A15, A18–A20 |
| MQ14 | The City of Two Shores | D2–D3 | At Archon, a lighthouse map and a smuggler’s oral route disagree. The player can solve the discrepancy through coastal observation, a night boat run, a climb to the lantern, or negotiation with Dunmer and Argonian pilots. If MQ10/MQ13 introduced the Collector, they can appear here as a fellow lodger at the pilot house, probing what the player knows. | **P3/P4/P6/P8/P9/P11/P12:** `LOC archon.lighthouse`, pilot house and coastal channel; climb route, boat route and interior stairs; night navigation markers; fixed reef/wreck hazards; safe return dock. | L01, L16–L20; V07, V10, A09–A13, A17 |
| MQ15 | The Eye Opens Once | D0 | Four of six regional leads are enough to triangulate the Eye. In Helstrom, the player combines maps, reflections, oral directions and route-names. Missing leads alter certainty and later entry options instead of blocking progress. **Mid-act escalation:** during the triangulation, word arrives that a second Hist has withdrawn — one adjacent to a city the player has already visited during the hunt (data-selected from visited leads). The place the player knows changes retroactively: closed shrine, grieving attendants, An-Xileel emergency presence. The hunt is no longer archaeology; the cult is testing its method while the player reads maps. | **P5/P11/P12/P13:** Reusable `LOC helstrom.archive_map_room`; interactive map/table sockets, clue-placement points and staged 4-actor interpretation scene; support all valid lead combinations in data; no new world geometry. Second-Hist withdrawal reuses the MQ04 `withdrawn` presentation tech as a `STATE hist02={healthy,withdrawn}` variant on one settlement per candidate lead city. | L10–L11, C01–C03; V09, A20 |
| MQ16 | A Key Without a Lock | D3 | The actual Eye is recovered from a submerged coastal Xanmeer observatory. A rival expedition, local custodians and the Veiled Reed all claim it. The dungeon combines water, climbing, light alignment and one limited guardian encounter. On first touching the Eye, the player receives a brief unbidden sap-dream vision — roots, a circle of trees, a door that has not been built yet — staged in a fog-dressed reuse of an existing interior cell. It foreshadows the Root of Accord (MQ26) without explaining it, and establishes that the Eye shows things it was not asked to show. | **P3/P6/P8/P9/P10/P12/P13/P14:** `LOC dungeon.eye_observatory`; A01 modular kit; dry and submerged routes, air pockets, climb shaft, light puzzle, guardian arena and extraction portal; Eye prop socket; `STATE observatory={sealed,opened,looted}`. | L07, L10–L12; A01, A10, A17, A20, A23; V04, V08 |
| MQ17 | The Veiled Reed’s Knife | D0–D2 | The Veiled Reed orders the player to infiltrate the cult using the Eye as bait. The player may accept honestly, plan a double game, or seek a Nisswo intermediary. Recruitment remains main-quest alignment, not a separate guild line. | **P11/P12/P13:** `LOC helstrom.veiled_reed_office`, Nisswo shrine and controlled meeting site; private briefing room, evidence lockers, three exit routes and state-dependent dialogue marks. | L02, L04–L05; V03, V06, A03–A04 |
| MQ18 | A Sermon Against Roots | D2 | The player attends an Unbound Root gathering under cover — and recognises the preacher: Opens-the-Last-Door is the Collector who has shadowed the treasure hunt since MQ07. They recognise the player too, and say nothing, which becomes its own quiet leverage in both directions. The sermon presents credible evidence of state abuse and a radical doctrine of freedom through severance. The player’s answers establish cult trust without a visible faction-choice menu — and cover can genuinely fail here: a blown identity turns the sermon house hostile and the concealed water exit into a live underwater escape, after which the questline continues on the harder failed-infiltrator track. | **P11/P12/P13:** `LOC cult.sermon_house`; public ritual room, private interview chamber, concealed water exit and guard-free social layout; 12–16 attendee sockets; limited scene with text topics; no mass animation. | L03–L06, L22, L33; A15–A17, A20, V03 |
| MQ19 | The Child of Two Hist | D2 | Two communities claim responsibility for an Argonian whose egg clutch and upbringing link them to different Hist. An-Xileel records, Tree-Minder testimony and the person’s own wishes conflict. The outcome tests both factions’ claims about identity. | **P4/P11/P12/P13:** Two nearby `LOC` settlements and a neutral hearing hut; stable family homes, egg-pool/ritual spaces and travel route; no child asset dependency—subject is an adult; `STATE identity_case` variants reflected through NPC schedules. | L03, L12, L16, L22; A15–A17, A19–A20 |
| MQ20 | Dreams for Sale | D2–D3 | The player discovers that a Veiled Reed office has purchased sap-dream testimony and used it to classify dissenters. The data prevented attacks but also enabled disappearances. Evidence can be copied, altered, returned or leaked. | **P11/P12/P13:** `LOC gideon.continuity_office` or regional equivalent; records room, interview cells, sap-storage lab, roof/canal infiltration and legal front entrance; evidence variants and 2–3 detainee NPCs. | L02–L03, L14–L16; V06, V09, A18–A20 |
| MQ21 | The Black Sap House | D3 | A cult laboratory has harmed volunteers while developing the Unbinding ritual. The Veiled Reed wants everyone killed; the cult contact asks the player to preserve research. Survivors complicate both narratives. | **P3/P8/P11/P12/P13:** `LOC cult.black_sap_lab`; stilt-house/cave hybrid, ritual pools, cages, treatment area, underwater escape and compact combat arena; `STATE lab={destroyed,seized,evacuated}`; fixed survivor outcomes. | L03–L05, L15, L23; A15–A17, A20–A22, A24; V03 |
| MQ22 | The Second Report | D0 | The player files two incompatible reports: one to the Veiled Reed and one to the cult or a neutral intermediary. This is the practical loyalty pivot, and it must not play as paperwork: within the same quest, one report is **acted on while the player watches**. A falsified Reed report triggers a raid on the wrong safehouse; an honest one triggers the arrest of a cult contact the player has met; a leak to a neutral party puts that intermediary in visible danger. The player can intervene, warn, or let it happen — but the lie (or the truth) has an on-screen victim before the quest closes. Earlier evidence controls which lies are credible and whether a genuine double-agent route remains open. | **P5/P11/P12:** Three small report locations already built; no new exterior; state-debug support for `reedTrust`, `rootTrust`, `coverIntegrity`, `publicKnowledge`; document handoff and successor NPC sockets. | L02, L04–L05; V06, A20 |
| MQ23 | Marks Only the Eye Can See | D3–D4 | The Eye reveals fixed route marks at several ancient sites. Prior treasure-hunt leads determine which of two routes becomes usable: a drowned/underwater chain (observatories and root tunnels merged into one wet route) or an elevated causeway chain. One complete route is sufficient; the un-taken route remains explorable as optional D3/D4 content. | **P2/P3/P4/P6/P8/P9/P10/P12/P14:** Two optional route chains with shared destination data (two, not three: a third chain would triple optional-route production for one-of-N use, so its best set-piece ideas belong inside these two); Eye-reveal shader/material variants on existing meshes; D3/D4 traversal; route-specific portals and camps; build only fixed visibility toggles, not procedural path changes. | L06–L07, L10–L12; A01, A10, A17, A23–A24; V04, V08 |
| MQ24 | The Missing Shadowscale | D3 | A vanished Shadowscale survivor knows the Lost City’s warding tradition. The player tracks them through a contract scene, a failed safehouse and a submerged escape route. They can be persuaded, killed, rescued or replaced by their notes. | **P8/P9/P11/P12/P13:** `LOC shadowscale.safehouse_mainquest` distinct from faction headquarters; rooftop and water exits; target apartment, ambush lane and note fallback; no dependency on Shadowscale faction membership. | L08–L09, L29; A02, A18, A20; V02–V03 |
| MQ25 | Council Behind Closed Gates | D0 | Helstrom’s council hears the Veiled Reed, Nisswo, Tree-Minders and cult-adjacent witnesses. The player can expose both sides, protect cover, or secure an expedition. Mid-session, the council is attacked — a small cult strike team or, on some paths, a Reed hardliner's staged provocation — and the player fights, shields a chosen witness or exploits the chaos; who survives the attack changes who reaches the sanctuary in MQ31. Attendance and arguments vary; the physical scene remains small. | **P4/P11/P12/P14:** `LOC helstrom.closed_council`; 8–10 actor marks but only 4–6 simultaneously active; side rooms for private bargains; one compact COMBAT-cleared chamber configuration for the mid-session attack (3–4 hostiles, existing humanoid assets); witness-protection scene sockets; local guard/NPC state variants; streaming prefetch for nearby city only. | L02–L06, L32–L33; A19–A20, V12 |
| MQ26 | The Root of Accord | D0–D2 | A hidden archive beneath Helstrom reveals the central twist: the Root is an ancient voluntary accord among selected Hist communities, later converted into a compulsory state instrument. The cult’s grievance is real; its proposed severance is indiscriminate. | **P10/P11/P12/P13:** `LOC helstrom.root_archive`; dry archive plus shallow sacred pool, animated root meshes, historical tableaux using static props, evidence sockets and one guardian encounter; no change to city exterior. | L03–L07, L22; A01, A20, A24; V04, V09 |
| MQ27 | The Road No Map Keeps | D0–D4 | The player chooses a practical expedition plan: Tree-Minder root guides, Reed-Sail boats, Veiled Reed scouts, cult smugglers or an independent mixed route. The quest is about bargaining, risk and sacrifice rather than collecting identical supplies. | **P4/P9/P11/P13/P14:** Expedition staging yard in Helstrom; route-specific guide NPCs, boat/dock or rootworm exits, fixed cache sockets, recovery camp and casualty fallback; one selected route loads, others remain optional. | L17–L21, L32; A11–A13, A17, A19; V07 |
| MQ28 | Out of Helstrom | D5 | The party leaves the safe city and crosses the deep basin. The route tests preparation through fixed predators, poison, visibility, swimming, climbing and shelter rather than scripted moving geography. | **P3/P4/P6/P7/P8/P9/P13/P14/P15:** Final D5 corridor from Helstrom gate/root station to Lost City approach; 2–3 shelters, traversal alternates, low actor counts, fixed ecology, performance-tested dense foliage and explicit retreat/fast-return logic. | L19–L21, L32; A06–A10, A17, A24–A25; V01, V04 |
| MQ29 | The City Beneath the First Rain | D5 | The Eye reveals and opens the Lost City. The dungeon is a near-final, multi-layer Xanmeer complex with ruined civic spaces, flooded passages, root architecture, cult occupation and evidence of the Accord’s creation. | **P6/P8/P9/P10/P12/P13/P14/P15:** `LOC dungeon.lost_city` with stable subcell IDs; A01 kit grammar, underwater entrance, climb route, stealth route, ritual/civic districts, shortcuts, rest point, cult NPC sockets and fixed treasure; 60–90 minute target. | L06–L07, L10–L12, L22; A01, A10, A17, A20, A23–A24; V04, V08–V10 |
| MQ30 | The Last Warden | D5 | An ancient Wamasu guardian blocks the sanctuary. The encounter has environmental lightning, water and cover but one shared arena across all branches. Evidence can enable a limited non-lethal or weakening route, but the asset burden stays fixed. | **P7/P8/P10/P12/P13/P14:** `BOSS lost_city.last_warden`; large arena with dry islands, shallow water, cover roots, camera clearance and lock-on validation; A06 creature pipeline; post-boss checkpoint and sanctuary portal. | L07, L12; A06, A01, A24; V04 |
| MQ31 | The Unbinding | D5 / sanctuary | At the Root sanctuary, the player completes or prevents the cult’s ritual. Veiled Reed and cult representatives reach the chamber according to trust and cover. The decision emerges from prior actions: state custody, plural custody, concealment, selective pruning or full severance. | **P10/P12/P13/P14:** `LOC lost_city.root_sanctuary`; Eye pedestal, Root mesh, 3–4 actor marks, one humanoid-duel-capable zone, ritual VFX toggles and five finite end states; no province-wide geometry changes. | L02–L07, L10–L12, L22; A01, A03–A05, A20, A24; V03–V04 |
| MQ32 | Names Written in Sap | D0–D2 | A modular epilogue shows selected Hist, Helstrom offices and affected communities reacting. Letters, rumours, appointments and a handful of NPC/ambient variants communicate province-wide consequences without rebuilding the map. | **P11/P13/P14/P15:** Epilogue sockets in Helstrom, opening settlement, Lilmoth and one chosen regional city; at most 4–6 local state swaps per ending family; letter/rumour pools; credits to surviving NPCs and documentary fallback. | L01–L06, L14–L16; A19–A20, V12 |

## 22. Pacing

- **Prologue and Act I:** prisoner escape, manageable marsh, first Hist case, Veiled Reed recruitment and early Helstrom.
- **Act II:** treasure hunt across outer cities and D1–D3 environments. The player is encouraged to build a cover through local and faction work.
- **Act III:** possession of the Eye, infiltration and moral exposure of both Veiled Reed and cult.
- **Act IV:** route revelation, Helstrom council and preparation for D5 country.
- **Act V:** D5 expedition, Lost City dungeon, Last Warden and sanctuary decision.

The full crisis is foreshadowed early, while urgency becomes immediate only after the Eye and cult plan are understood. This protects open-world pacing.

## 23. Critical NPC and fail-forward policy

Each main role needs:

- primary NPC;
- successor or documentary fallback;
- altered dialogue/outcomes if primary dies;
- stable body/corpse/document location if death is meaningful;
- no universal “essential” flag as the only protection;
- explicit quest-debug indication of which fallback is active.

The Eye cannot be permanently lost. If dropped, stolen or placed in faction custody, the runtime must preserve a recoverable reference or transfer its state through a documented handoff.

---


# Part V — Ending architecture

## 24. Ending families

### 24.1 Guarded Eye

The cult is defeated and the Root remains under Veiled Reed/An-Xileel custody.

**Benefits:** continuity, coordinated warning, immediate security and a clear institution responsible for protection.  
**Costs:** secrecy, classification, pressure on dissenting Hist communities and a strengthened internal-security state.

A moderated variant is available if the player exposed abuses and preserved reformist personnel, but it remains centralised.

### 24.2 Open Eye

The cult is defeated and custody is divided among participating Hist communities, Nisswo, civic delegates and independent archivists.

**Benefits:** plural oversight and no single owner.  
**Costs:** slower decisions, institutional rivalry, leaks and weak protection for communities outside the participating bodies.

### 24.3 Hidden Eye

The player seals the Lost City, conceals or destroys the route records and prevents both organisations from controlling the sanctuary.

**Benefits:** no immediate monopoly and no Unbinding.  
**Costs:** the existing compulsory arrangements persist, knowledge is lost, and future rediscovery is likely.

**Dark variant — the Kept Key.** The player publicly announces sealing while privately retaining the route records or the Eye itself, alone or with a small chosen circle. This is implemented as a hidden objective within the Hidden Eye family, not a separate ending: same sanctuary state, same public epilogue, plus a private epilogue thread of leverage, blackmail risk and ominous pursuit. Keeping it a variant rather than a sixth family avoids a full extra validation branch for what is, in world-state terms, the same sealed sanctuary.

### 24.4 The Unbinding

The player enables the cult ritual. The Root of Accord is severed.

**Benefits:** state access to the Accord ends; people and communities previously coerced through it may gain genuine autonomy.  
**Costs:** several Hist become silent or withdrawn, communal rites fracture, political violence follows and the cult cannot guarantee what replaces the old bond.

This is a fully supported ending, not a joke “evil choice.” It requires real double-agent work and carries serious aftermath.

### 24.5 The Pruned Root

The player preserves the living Root while disabling the concealed machinery and legal claims that made participation compulsory.

This difficult compromise requires:

- original consent records from MQ26;
- proof of Veiled Reed abuse;
- survival/support of at least two independent custodians;
- enough cult trust to understand the ritual;
- enough Veiled Reed trust or cover integrity to reach the sanctuary with the necessary tools;
- selected Hist/community outcomes that demonstrate consent can be renewed.

**Benefits:** continuity with reduced central coercion.  
**Costs:** unstable transition, weakened state capacity, continued disagreement over whether the Root should exist.

The ending architecture comprises exactly **five families** (Guarded, Open, Hidden, Unbinding, Pruned Root), matching the five finite sanctuary end states specified in MQ31. Darker independent play is expressed through the Kept Key variant inside the Hidden family, not through additional families.

## 25. Low-complexity implementation

All endings reuse:

- the same Lost City;
- the same Last Warden encounter;
- the same sanctuary;
- the same Eye and Root assets;
- the same Helstrom council location;
- the same main cast where alive.

Differences consist of:

- which 2–4 actors reach the sanctuary;
- one possible humanoid duel or negotiation;
- ritual VFX/material toggles;
- local sanctuary state;
- selected Hist audio/particle/NPC variants;
- faction-office schedules and banners;
- letters, rumours and epilogue text.

## 26. Persistent regional consequences

Each ending chooses only a bounded set from:

- opening Hist settlement status;
- Helstrom Veiled Reed leadership;
- Helstrom council composition;
- one Lilmoth/urban response;
- one northern response;
- one western civic response;
- access to the Lost City after completion;
- selected Hist silence/reconciliation presentation;
- surviving main characters and their roles.

The epilogue may describe broader change beyond the playable state.

