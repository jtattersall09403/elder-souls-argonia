# Gap register — what the game must know that canon does not say

Packet 2 output. Produced 2026-08-24 after the Packet 1 sweep
(see [PROGRESS.md](PROGRESS.md) for the page list).

**How to read this.** Each gap has an ID, a question, what canon *does* give us
to grip on, and a status:

- `FILLED` — answered in [argonia-4e201-state.md](argonia-4e201-state.md).
- `OWNER` — escalated to [owner-questions.md](owner-questions.md); do not decide.
- `OPEN` — still needs an extrapolation pass. Next agent: start here.
- `DEFER` — genuinely doesn't need answering until a later phase; noted so nobody
  re-discovers it.

**Rule for filling.** Take the *least inventive* answer consistent with the
anchors, and prefer answers that explain something we already have to build.

---

## 1. Province-scale government

| ID | Question | Anchors | Status |
|---|---|---|---|
| G1.1 | **Who governs Argonia in 4E 201?** | An-Xileel "status unknown" after 4E 48; "receives no mention in the following centuries"; the Scalded Throne empty for centuries; Argonians "do not consider it a singular nation". | `OWNER` Q1 |
| G1.2 | Is there any province-wide institution at all — court, moot, council, treasury, army? | The Organism (An-Xileel council, Lilmoth, 4E 48); the Great Moot (Pact, 2E, defunct); Vicecanons (2E civic office, Stormhold); nothing else. | `FILLED` §1 |
| G1.3 | What is the province called by its own people now, and what does the state call itself? | No Jel word for the homeland; *kronka-thatith*; "Argonia" is a mer name; the An-Xileel "renamed the land Argonia" at secession. | `FILLED` §1 |
| G1.4 | Who commands armed force, and how much? | Shellbacks (heavy infantry), kaals and raj-kaals (tribal), Black Fin Legion (2E, defunct), Archein guards, city guards at Helstrom/Thorn/Lilmoth, "occasional patrols" on the Morrowind frontier in 4E 201. | `FILLED` §2 |
| G1.5 | Is there a legal system above the tribe? | Murkmire has "a less-structured justice system"; arbitrators chosen by both parties, usually the tree-minder; Shadowscales brought "swamp law" as *ku-vastei* arbiters; Vicecanons had magistrate powers; Lilmoth's merchant council hired guards and set tariffs. | `FILLED` §2 |
| G1.6 | Does Argonia have foreign relations — embassies, treaties, recognition? | Blackrose sent an ambassador to the Imperial court (3E); Hierem negotiated in 4E 47; nothing after. Argonia is not party to the White-Gold Concordat. | `FILLED` §5 |
| G1.7 | What replaced the An-Xileel's Hist monopoly? Who speaks for the Hist province-wide, if anyone? | Lilmoth An-Xileel took counsel from no other Hist; tree-minders and sap-speakers are *tribal* offices; the Hist share one mind but individuals isolate. | `OWNER` Q2 |

## 2. The eight major cities + Alten Corimont

Every city needs: **who runs it, what condition it is in, what it lives on, who
lives there, what it is afraid of, how it treats outsiders.** Canon answers "who
runs it" for none of them in 4E 201.

| ID | City | Specific gaps | Anchors | Status |
|---|---|---|---|---|
| G2.1 | **Lilmoth** | Was it rebuilt after 4E 48? Who governs? Is the merchant council back? What is the state of the *third* Hist? Is Pusbottom still the criminal quarter? Do the foreigner-licensing rules survive? | Destroyed 4E 48; "the Slaughter at Lilmoth"; merchant council (2E–3E); Hist regrew from a root fragment once before (3E 173→4E 8); An-Xileel seat. | `OWNER` Q1 (identity), otherwise `FILLED` §4 |
| G2.2 | **Stormhold** | Recovery from the 4E 48 undead attack? Who holds it — Vicecanons, a tribe, an An-Xileel successor? Dunmer minority's position on the border? State of the Silyanorn tunnels and the crystal trade? Is the Conclave of Baal still there? | "Destruction considered light"; Vicecanon office invented here; Dunmer stonework and mud huts; outlaws' refuge below; Conclave of Baal. | `FILLED` §4 |
| G2.3 | **Gideon** | Canon says it is "an active settlement" later in the 4E — under whom? Do the Nibenese-descended families remain, 200 years after the Empire left? Is the Governor's Mansion occupied, and by what? Do the Archein serfdoms still exist? Is Blackwood Road open? | Lukiul-majority; Imperial civic fabric; Archein kleptocracy; monsoon road closures; rootworm terminus. | `FILLED` §4 |
| G2.4 | **Helstrom** | Who leads the "immortal capital"? A coalition of interior tribes, a Hist council, a hereditary office, or nothing? What happened to the 3E interior settlements built around it? Why is the city guard "dangerous"? | Never besieged; King Germanus (3E); "the capital" in the Simulacrum; interior settlements built by the 4th century 3E; Panther River fork; exclusive interior breeds. | `OWNER` Q2 (Hist authority), otherwise `FILLED` §4 |
| G2.5 | **Thorn** | Who owns the saltrice fields now that Dres is gone? What is the Dunmer minority's legal position? Are Archein villages still Archein? What is the border regime with Tear? | Dres occupation to 3E; Archein-owned villages; "guards always turn a blind eye"; grassland; Accession War frontier. | `FILLED` §4 |
| G2.6 | **Archon** | Who runs the port? Does the EEC infrastructure still function, and for whom? Is the Shadowscale facility guarded, sealed, squatted or forgotten? Is the pirate/privateer tradition alive? | EEC south-east line hub (Lilmoth–Soulrest–Tear); letters of marque tradition; facility closed 4E 187; Dunmer minority; amphibious civic culture. | `FILLED` §4 |
| G2.7 | **Soulrest** | It was the Third Era capital — what is a former capital when its empire has left? Are the gold and timber workings reopened? Who controls Bramman's river? What holds the mixed population together? | Capital until secession; mines and plantations destroyed 3E 427; the Expeditionary Force; wraxu-etched xanmeers; Khajiit-heavy maritime population; "struggle for regional hegemony". | `FILLED` §4 |
| G2.8 | **Blackrose** | Does the city still function? What is its relationship to the Rose? What became of its rebel tradition? Who are the "few who leave"? | In a lake at a three-river confluence; "in ruins" rumour 2E 582; rebellion broken by Welloc late 3E; Lilmothiit foundations. | `FILLED` §4 |
| G2.9 | **Alten Corimont** | Is it still a smuggler freehold? Who is its captain? Does it still refuse to take sides? | 2E: Captain One-Eye, neutral by policy; 3E: grown to a small town under Lord Tibius; All Flags Navy loss. | `FILLED` §4 |
| G2.10 | **All cities**: what is each city's **Hist**, and what state is it in? | Lilmoth has a city tree despite no native tribe; Stormhold's stands in a pond in the town square; Stonewastes' is in the town centre. Canon implies every settlement has one. | `OPEN` — needs a per-city answer before Phase 11 |
| G2.11 | **All cities**: population magnitude. Nothing in canon gives numbers for any settlement in the province. | "Most centralised settlement in Murkmire" (Lilmoth); "largest settlement of Shadowfen" (Stormhold); "small port town" (Alten Corimont); "medium-sized" (Stonewastes). Only relative sizes exist. | `OPEN` — needs a magnitude ladder, not counts |
| G2.12 | **All cities**: currency, prices, weights. Septims are used (Scotti pays 5 gold for directions). Is coin normal in the interior? | Septims attested at the frontier; Agacephs and deep tribes have no shown use for coin; "no use for the more benign trinkets found within the ruins… would prefer fresh slugs and sturdy tools". | `OPEN` |

## 3. Secondary settlements

| ID | Question | Anchors | Status |
|---|---|---|---|
| G3.1 | Which of the ~30 named secondary settlements still exist in 4E 201, and which are ruins? | Fifteen are Arena names with **no canon substance at all** (Greenspring, Seafalls, Branchmont, Riverwalk, Portdun Mont, Longmont, Rockspring, Chasepoint, Chasecreek, Rockpoint, Alten Markmont, Murkwater, Branchgrove, Moonmarch, Seaspring). Nine have real Lore pages. Three are canon disaster sites (Stillrise, Rockpark, Zuuk). | `OPEN` — but the adjacency graph in [../regions/secondary-settlements.md](../regions/secondary-settlements.md) constrains placement already |
| G3.2 | What is the Argonian *village* baseline — size, layout, offices, defences? | Offices are fully specified (tree-minder, naheesh, kaal, grave-singer, egg-tender, root-herald); building materials are region-specific; "villages don't stay put for very long". | `FILLED` §3 |
| G3.3 | Are there drifting/floating villages in our world, and how do we represent them? | Hixinoag drifts; Alten Meerhleel is called a floating village; canon states it of villages generally. | `OPEN` `DEFER` to Phase 11 — needs a technical answer, not a lore one |
| G3.4 | What happened to the Imperial-era **toll-towns**? | PGE1 caption "A toll-town Argonian"; the Tum-Taleel toll the Keel-Sakka bridge; no other detail. | `FILLED` §3 |
| G3.5 | Does Blackrose Prison operate in 4E 201? Who holds it? | Built 2E; abandoned c. 2E 430s; Blackguard-held; reclaimed by the Third Empire; **broken open in 3E 432**; silence after. | `OWNER` Q3 |
| G3.6 | Where is **White Rose Prison**? | Named twice, never located. Argonians who died there still need their bones brought home. | `OPEN` — free placement, strong hook |
| G3.7 | Is **Fort Swampmoth** still standing, and who is in it? | Third Empire Legion fort; "rumours that the Legions had been recalled" during the Oblivion Crisis; never located. | `OPEN` — free placement |
| G3.8 | Where does an outsider *legally* enter the province, and what happens there? | Slough Point census-and-excise (Cyrodiil border, tidal bridge); Blackwood Road; Lilmoth's dock-only rule for unlicensed foreigners; Alten Corimont takes anyone. | `FILLED` §5 |

## 4. Factions

| ID | Faction | Gaps | Anchors | Status |
|---|---|---|---|---|
| G4.1 | **An-Xileel** | Exists? Strength? Aims? Who leads? Does it still hold Lilmoth? Is "The Organism" a live institution? | See [../an-xileel.md](../an-xileel.md). | `OWNER` Q1 |
| G4.2 | **Archeins** | "It is currently unknown how the Archeins fared in the wake of the Oblivion Crisis, after the province seceded from the Empire, or when it was taken over by the An-Xileel" — canon says this in so many words. Did they survive a nativist revolution as an openly collaborationist class? | Kleptocrats, universally hated, but also *the actual rural administration* of the province for 1,300 years. Also Heita-Meen took the Archein guard by duel and used it — Archein institutions are transferable. | `FILLED` §2 |
| G4.3 | **Shadowscales** | Extinct or a last generation? Who fills the ku-vastei arbiter role now? What happened to Black-Tongue tradition with nowhere to send hatchlings? | Archon facility closed 4E 187; last known living Shadowscale dies 4E 201; order "no longer a fully functioning group". | `FILLED` §2 |
| G4.4 | **Clutch of Nisswo** | Still travelling? Do they have any political weight in the vacuum? | Loose fellowship, no central governance, welcome in almost every village including insular ones; the Dark Brotherhood defers to them. Canon gives no 4E state. | `FILLED` §2 |
| G4.5 | **The Wild Ones** | Who are they? They are named twice, in 4E 8 and 4E 48, alongside the An-Xileel, with complete Hist access — and never explained. | Two mentions, no definition. | `OPEN` — high-value free hook |
| G4.6 | **House Dres / Morrowind** | Is there any Dunmer state presence on the border? Are there still slavers? What is the status of Argonian-held southern Morrowind? | Slavery abolished 3E 430 but slavers active in Arnesia into the latest 3E; Argonians hold Scathing Bay; "a few tribes… occasional patrols" in 4E 201; Dunmer consider it over. | `FILLED` §5 |
| G4.7 | **The Empire** | Is there any Imperial presence at all — a consul, a trade mission, a spy? | Nothing after 4E 47. Empire lost the Great War 4E 175 and is weak. | `FILLED` §5 |
| G4.8 | **Thalmor** | Any presence? They incited the uprising and once tried to sterilise the Argonian race. | No canon 4E presence in-province. | `FILLED` §5 |
| G4.9 | **East Empire Company** | Does the Archon–Lilmoth–Soulrest–Tear line still run, under anyone? | EEC is Windhelm-based in 4E 201 with northern problems; nothing places it in Argonia post-secession. | `FILLED` §5 |
| G4.10 | **Mages Guild / Fighters Guild / Synod / College of Whispers** | Any presence? The Mages Guild had halls at Archon, Thorn, Soulrest and Hissmir, and both guilds even at Alten Corimont. The Mages Guild dissolved in the early 4E; the Synod and College are its successors. | **The Synod had no conclave in Lilmoth "nor any presence at all for roughly 400 miles"** as of the 4E 40s — the single hardest datum we have on 4E magical institutions in Argonia. | `OPEN` — quest plan cites L24–L26; needs a pass |
| G4.11 | **Thieves Guild / Dark Brotherhood** | Presence in Argonia? | DB reaches in via Shadowscales only, and is in decline; Cheydinhal wanted Archon reopened in 4E 187. Thieves Guild is a Skyrim/Cyrodiil institution; Lilmoth's Pusbottom and Alten Corimont are the native equivalents. | `OPEN` — quest plan has a Thieves line |
| G4.12 | **Cyrodilic Collections** | Did it survive? Its museum-in-Black-Marsh ambition is the perfect legitimising cover for a foreign presence in our era. | 2E organisation; nothing after. | `OPEN` — recommend revival, see §5 |
| G4.13 | **Sul-Xan**, **Blackguards**, **Lut-Eileel**, **Four Winds** | Do these local powers persist? | All 2E-attested; none contradicted since. | `FILLED` §3 |
| G4.14 | **Pirates** | Two canon pirate grounds (eastern Topal Bay; the Archon coast). Who runs them with no Imperial fleet to fight? | "The pirates who have never truly been eliminated"; the Emperor's fleet is gone; Southern Sea pirates keep low profiles against Altmer/Maormer warships and are largely **Khajiit**. | `FILLED` §5 |

## 5. Regional and economic

| ID | Question | Anchors | Status |
|---|---|---|---|
| G5.1 | What does Argonia trade, and with whom, in 4E 201? | Subsistence baseline is canon and non-negotiable. Historic exports: gold, timber, saltrice, rice, herbs, hunting produce, slaves. Historic route: EEC's Archon–Lilmoth–Soulrest–Tear. Craft goods with export appeal: xeech'kis, jewellery, woven work, wamasu hide and luminescent organs, Hist-sap rubber, ceramics. | `FILLED` §6 |
| G5.2 | Who moves goods inland, and how? | Rafts and rootworms beat every Imperial road by 5:1 on time and 100% on spoilage. Roads exist but silt, flood and close seasonally. | `FILLED` §6 |
| G5.3 | Are the eight cities actually connected by road in 4E 201, as our acceptance rules require? | Canon gives Blackwood Road (Leyawiin–Gideon), the Imperial Commerce Road (a reed field), the muddy Onkobra road, stone causeways (Stormhold–Bogmother), the Tear road, and the Gideon–Leyawiin trade route. Nothing describes a complete internal network. | `FILLED` §6 — with an explicit reconciliation of the acceptance rule |
| G5.4 | What is the danger baseline outsiders face, and does it differ for Argonians? | Argonians are immune to poison and disease and cannot drown. Foreigners die of swamp rot in a month, are eaten by fleshflies, and cannot drink the water. Blackrose Prison was sited on the principle that **the climate itself kills non-Argonians past a point**. | `FILLED` §7 |
| G5.5 | What is the flood/season cycle and how does it gate movement? | Monsoon closes the Gloommire roads; tidal rivers swamp bridges for days; the marsh "inevitably floods" (hence grave-stakes); Haynekhtnamet was appeased to stop "the seasonal flooding". | `FILLED` §7 |
| G5.6 | Demographics: are the quest plan's community priors defensible? | Canon gives no census. It *does* give: Gideon majority-Lukiul with Nibenese; Stormhold historically multiracial under the Dunmer; Archon/Thorn Dunmer-facing; Soulrest cosmopolitan with Khajiit seafarers; Lilmoth foreigners restricted to the docks in the 4E; Helstrom overwhelmingly Argonian; Bretons at Hereguard. | `FILLED` §4, with one flag |
| G5.7 | How many Hist are there, and where? | "Grow in the innermost region"; a "great forest of full-grown Hist trees" in the deep interior; but also city trees at Lilmoth and Stormhold, a town-centre tree at Stonewastes, and one per tribe. | `OPEN` — needs a placement rule before Phase 11 |
| G5.8 | What is the state of the pre-Duskfall ruin network? Which xanmeers are inhabited, maintained, sealed or hostile? | Canon names ~30 xanmeers by region and states that Argonians **actively maintain** them, and that some tribes live in them for the protection of their walls and ancient defences. | `OPEN` — Phase 12 input |

## 6. Deliberately not to be closed

Canon leaves these open on purpose. Our world should preserve the mystery, not
resolve it. Recorded here so no future agent "fixes" them.

| ID | Mystery |
|---|---|
| G6.1 | **What Duskfall was.** Sources describe it only poetically. Keep it unexplained. |
| G6.2 | **What the Eye of Argonia is.** Canon deliberately leaves its nature open; our functional reading is project layer and should stay flagged as such. |
| G6.3 | **Whether there was ever a King of Black Marsh.** The Scalded Throne's existence is itself disputed in canon. |
| G6.4 | **Who made the Knahaten Flu.** Three incompatible accounts, all in canon. |
| G6.5 | **Why the Argonians stopped fighting in 1E 2836.** No source knows. |
| G6.6 | **What the Hist actually are and want.** Every account is from outside or from a believer. |
