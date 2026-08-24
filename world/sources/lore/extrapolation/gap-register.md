# Gap register — what the game must know that canon does not say

Packet 2 output, closed out 2026-08-24 after packets 3–7.

**Status: zero `OPEN`.** Every gap is `FILLED`, `DECIDED` (owner), or `DEFER`
with a stated reason and a phase it belongs to.

**How to read this.** Each gap has an ID, a question, what canon gives us to grip
on, and a status:

- `FILLED` — answered, with the file and section that answers it.
- `DECIDED` — owner decision of 2026-08-24 ([owner-questions.md](owner-questions.md)).
- `DEFER` — genuinely does not need a lore answer; the remaining work is
  technical or belongs to a later phase. Reason and phase given.
- `MYSTERY` — canon leaves it open on purpose and so do we.

**Rule used when filling.** The *least inventive* answer consistent with the
anchors, preferring answers that explain something we already have to build.

### Where the answers live

| File | Answers |
|---|---|
| [argonia-4e201-state.md](argonia-4e201-state.md) | Province government, cities, foreign relations, economy, routes, danger, the trauma directive (§9) |
| [settlement-register.md](settlement-register.md) | Every settlement's 4E 201 status, magnitude, currency tiers, White Rose, Fort Swampmoth, drifting villages, xanmeer states |
| [../topics/hist-placement.md](../topics/hist-placement.md) | Which Hist stands where, in what state, and who speaks for it |
| [../topics/guilds-and-orders.md](../topics/guilds-and-orders.md) | Synod, College of Whispers, Fighters/Thieves Guild, Dark Brotherhood, Cyrodilic Collections, the Wild Ones, the Conclaves |
| [../topics/ecology-encounters-loot.md](../topics/ecology-encounters-loot.md) | Encounter composition, territory-holders, loot provenance, seasonal keying |

---

## 1. Province-scale government

| ID | Question | Status |
|---|---|---|
| G1.1 | **Who governs Argonia in 4E 201?** | `DECIDED` Q1 — An-Xileel **successor state**: inherited offices, titles and name; not the mandate. → state §1 |
| G1.2 | Is there any province-wide institution at all? | `FILLED` — a **minimal state** (border force, port customs, a claim to speak abroad, almost no writ inland) plus the **great Root Talk convocation**, which is an occasion, not a government. → state §1–2 |
| G1.3 | What is the province called by its own people, and what does the state call itself? | `FILLED` — *Argonia* officially; *Black Marsh* abroad; **no Argonian word** at all, only *kronka-thatith* and the wide-swamp gesture. The state is officially "the An-Xileel", colloquially "the Archwardens / the Organism / the Wardens". → state §1 |
| G1.4 | Who commands armed force, and how much? | `FILLED` — city **shellback levies**, tribal **kaals**, and a **frontier screen** of a few hundred irregulars. No standing army, no navy. The deterrent is the guerrilla reputation and the marsh. → state §2 |
| G1.5 | Is there a legal system above the tribe? | `FILLED` — no. **Vicecanons** (magistrates) in the northern cities, **merchant councils** in the ports, chosen **arbitrators** in the villages, and the collapsing **ku-vastei** arbiter role. → state §2 |
| G1.6 | Foreign relations — embassies, treaties, recognition? | `FILLED` — none formal. Three legal entries (Blackwood Road, Tear road, the ports) and one deliberate loophole (Alten Corimont). → state §5 |
| G1.7 | Who speaks for the Hist province-wide? | `DECIDED` Q2 — **nobody standing**. The **great Root Talk at Helstrom** in Hist-Tsoko is a convocation with no executive power. → state §2, hist-placement |

## 2. The eight majors and Alten Corimont

| ID | City | Status |
|---|---|---|
| G2.1 | **Lilmoth** | `DECIDED` Q4 — rebuilt but not restored; merchant council; drowned Imperial quarter unrepaired; Pusbottom repopulated; third Hist **feared and tended** with a rotating tree-minder's post; politically hostile to the successor state. → state §4, lilmoth.md, hist-placement §4 |
| G2.2 | **Stormhold** | `FILLED` — Vicecanons; the state's working border offices; crystal trade; oldest and largest Dunmer minority; town-square Hist. → state §4 |
| G2.3 | **Gideon** | `FILLED` — civic council in the Governor's Mansion, courthouse still sitting; Lukiul-majority; rootworm terminus; Archein plantations left derelict; a **disputed Hist cutting** in the city gardens. → state §4, hist-placement |
| G2.4 | **Helstrom** | `FILLED` + `DECIDED` Q2 — an assembly of interior naheesh and tree-minders that becomes the great Root Talk in Hist-Tsoko; a tribal guard accountable to nobody outside; the state's formal seat, largely ignored by it. → state §4 |
| G2.5 | **Thorn** | `FILLED` — Vicecanon(s) and the disputed field-owners; saltrice title unresolved since Dres left; large Dunmer minority from mixed families; field-edge Hist outside the walls. → state §4 |
| G2.6 | **Archon** | `FILLED` — harbour authority in the EEC's old buildings; the province's principal legal port; the letters-of-marque tradition substitutes for a navy; Shadowscale facility sealed and watched. → state §4 |
| G2.7 | **Soulrest** | `FILLED` — genuinely contested (merchant council, orphaned Imperial apparatus, the tribes who burned the mines, the river interests); gold and timber workings still derelict since 3E 427; **no Hist in the city**. → state §4, hist-placement |
| G2.8 | **Blackrose** | `FILLED` — whoever holds the island core; three-river transit and tolls; ruined-and-rebuilt quarters of several ages; a **drowned Hist** in the lake. → state §4 |
| G2.9 | **Alten Corimont** | `FILLED` — captain of the port; principled neutrality with a price list; the beached ship still the social hall; **no Hist**. → state §4 |
| G2.10 | **Every settlement's Hist** | `FILLED` — placement rule (R1–R6) plus a per-settlement register. → [../topics/hist-placement.md](../topics/hist-placement.md) |
| G2.11 | **Settlement magnitude** | `FILLED` — a six-class ladder defined in **structures, not people**, since canon gives no census and Phase 11 needs buildable scale. → settlement-register §1 |
| G2.12 | **Currency and exchange** | `FILLED` — three tiers: **septims still circulate** in the cities and ports (no mint replaced them), barter and obligation in the villages, nothing in the deep interior. → settlement-register §7 |

## 3. Secondary settlements

| ID | Question | Status |
|---|---|---|
| G3.1 | Which secondary settlements exist in 4E 201? | `FILLED` — every canon-named settlement given a 4E 201 status and class, plus proposed roles for the fifteen Arena-name settlements. → settlement-register §3–4 |
| G3.2 | The Argonian village baseline | `FILLED` — Hist, uxith, the canon office set, region-specific building materials, built to be replaced. → state §3, material-culture |
| G3.3 | Drifting / floating villages | `FILLED` (lore) + `DEFER` (implementation, **Phase 11/14**) — three distinct phenomena; only one needs engineering, and the recommendation is **exactly one** hand-authored drifting village with two or three seasonal moorings. → settlement-register §5 |
| G3.4 | Imperial-era toll-towns | `FILLED` — toll-taking is the normal form of rural revenue; **every bridge, ford, mangrove channel and portage has an owner**. → state §3 |
| G3.5 | Does Blackrose Prison operate? | `DECIDED` Q3 — **ruin reoccupied by the Blackguards' heirs**, Umbriel's undead below. → prisons.md, settlement-register §3 |
| G3.6 | Where is **White Rose Prison**? | `FILLED` — inland in the western burn country between Soulrest and the interior; abandoned, structurally sound, **full of Argonian dead who never got home**. → settlement-register §6 |
| G3.7 | Is **Fort Swampmoth** standing, and who holds it? | `FILLED` — on the Blackwood frontier commanding the road between Slough Point and Gideon; **held, but not by the Empire**. → settlement-register §6 |
| G3.8 | Where does an outsider legally enter? | `FILLED` — three legal entries and one loophole. → state §5 |

## 4. Factions

| ID | Faction | Status |
|---|---|---|
| G4.1 | **An-Xileel** | `DECIDED` Q1. → an-xileel.md, state §1–2 |
| G4.2 | **Archeins** (canon explicitly flags this gap) | `FILLED` — the *name* is now an insult nobody claims; the *families* largely survive, stripped of Imperial titles, rebranded, performing the same functions for the state. → state §2 |
| G4.3 | **Shadowscales** | `FILLED` — a last generation. Archon closed 4E 187, the last known Shadowscale dies 4E 201, the Black-Tongues have had nowhere to send hatchlings for fourteen years, and the Dark Brotherhood wants the school back. → sithis-nisswo-shadowscales, guilds-and-orders §3 |
| G4.4 | **Clutch of Nisswo** | `FILLED` — alive, itinerant, partially filling the ku-vastei vacuum, and structurally unable to become a judiciary because it has no central governance by design. → state §2 |
| G4.5 | **The Wild Ones** | `FILLED` — **not an organisation**: a category the An-Xileel named and claimed, the opposite number to *Lukiul*. Now a slur in both directions. One `AGENT_INVENTED` extension (surviving vigil-communities) raised as **Round 2 Q6**. → guilds-and-orders §5 |
| G4.6 | **House Dres / Morrowind** | `FILLED` — a cold, settled frontier; Argonians hold Scathing Bay and patrol occasionally; the Dunmer consider it long over. → state §5 |
| G4.7 | **The Empire** | `FILLED` — absent for two centuries, no official presence; Imperial *people* everywhere; at most a trade factor at Archon with no diplomatic status. → state §5 |
| G4.8 | **Thalmor** | `FILLED` — no presence; interest real, deniable, at arm's length. → state §5 |
| G4.9 | **East Empire Company** | `FILLED` — gone; its wharves and bonded stores are not. → state §5 |
| G4.10 | **Mages Guild / Synod / College of Whispers** (L24–L26) | `FILLED` — **no magical institutions in the province at all**, anchored on the canon datum that the Synod had no presence "for roughly 400 miles". Both successors operate through intermediaries: the Synod hunting artefacts, the College hunting **Umbrielic remains**. Plus the free canon link that **Hierem**, who set Umbriel in motion, was the Synod's most influential patron. → guilds-and-orders §2 |
| G4.11 | **Thieves Guild / Dark Brotherhood** | `FILLED` — no Imperial Thieves Guild; the native equivalents are Pusbottom, Alten Corimont, the Blackguards and the tribeless Naga. The Brotherhood's only route in was the Shadowscale pipeline and it is closed; its live interest is reopening Archon. → guilds-and-orders §3 |
| G4.12 | **Cyrodilic Collections** | `FILLED` — **revived**, and recommended sited at **Gideon**; its unbuilt museum is a genuine argument against a religion of letting go. → guilds-and-orders §4 |
| G4.13 | **Sul-Xan, Blackguards, Lut-Eileel, Four Winds, Veeskhleel, Xit-Xaht** | `FILLED` — all persist; each given territory and character as an attributable encounter-holder. → ecology-encounters-loot §3 |
| G4.14 | **Pirates** | `FILLED` — two grounds, two characters: Archon's ex-privateers with paperwork, and Bramman's heirs in the mangrove river. → state §5 |
| G4.15 | **The Conclaves and the cult of Seth** (new) | `FILLED` — orphaned colonial urban cults, mostly decayed; the **Conclave of Baal at Stormhold survives** because only it can locate Murkwood. The **Seth** cult is the best unclaimed religious hook in the corpus. → guilds-and-orders §2 |

## 5. Regional and economic

| ID | Question | Status |
|---|---|---|
| G5.1 | What does Argonia trade, and with whom? | `FILLED` — subsistence baseline, low-volume high-value craft exports, and an illegal trade whose flagship commodity is **Hist sap**. → state §6 |
| G5.2 | Who moves goods inland, and how? | `FILLED` — rafts and rootworms, which beat every Imperial road 5:1 on time and absolutely on spoilage. → state §6 |
| G5.3 | Are the eight cities connected by road, per the acceptance rule? | `FILLED` — yes, and **most of it is water**: a route with a maintained crossing at every water, closing seasonally. Trunk structure listed. → state §6 |
| G5.4 | Danger baseline, and does it differ for Argonians? | `FILLED` — **species-stratified**: the interior is lethal to outsiders as terrain. Canon's own principle, from the siting of Blackrose Prison. → state §7, ecology §1 |
| G5.5 | Flood/season cycle and how it gates movement | `FILLED` — wet / dry / wintertide, with route availability, water level and the rootworm line keyed to it. → ecology §6 |
| G5.6 | Are the quest plan's demographic priors defensible? | `FILLED` — broadly yes, with two corrections: Gideon is **canonically majority Lukiul**, and Thornmarsh is **grassland**. → state §4, quest-plan-deltas D7 |
| G5.7 | How many Hist, and where? | `FILLED` — density gradient R1, four kinds of tree R2, eight states R3, absence rules R4, continuous root layer R5, one-tree-one-look R6. → hist-placement |
| G5.8 | State of the pre-Duskfall ruin network | `FILLED` — four-state model (tended / inhabited / sealed / broken) with shares, and the rule that **a xanmeer's state is a social fact before it is a level-design fact**. → settlement-register §5 |

## 6. Deferred — technical, not lore

| ID | Item | Phase | Reason |
|---|---|---|---|
| D-1 | How a drifting village is represented at runtime | 11 / 14 | The lore answer is settled (one village, two or three seasonal moorings). What remains is a streaming and authoring choice. |
| D-2 | Exact xanmeer count and per-site interior graphs | 12 | The state model and shares are set; individual dungeon layouts are Phase 12 work. |
| D-3 | Encounter tables as data | 13 | Composition, territory-holders and loot provenance are specified; turning them into tables needs the Phase 13 schema. |
| D-4 | Hist as a placed entity with IDs | 11 | The register names every tree and its state; stable semantic IDs come with the Phase 11 location records. |
| D-5 | Seasonal state machine | 8 / 13 | The wet/dry/wintertide model is specified; water level and route gating are systems work. |

## 7. Mysteries — deliberately not to be closed

Canon leaves these open on purpose. Recorded so no future agent "fixes" them.

| ID | Mystery |
|---|---|
| G6.1 | **What Duskfall was.** Sources describe it only poetically. |
| G6.2 | **What the Eye of Argonia is.** Canon deliberately leaves its nature open; our functional reading is project layer and stays flagged as such. |
| G6.3 | **Whether there was ever a King of Black Marsh.** The Scalded Throne's existence is itself disputed in canon. |
| G6.4 | **Who made the Knahaten Flu.** Three incompatible accounts, all canon. |
| G6.5 | **Why the Argonians stopped fighting in 1E 2836.** No source knows. |
| G6.6 | **What the Hist actually are and want.** Every account is from outside or from a believer. |
| G6.7 | **What the "Wild Ones" meant to the people so named.** We have fixed what the *An-Xileel* meant by it; what the interior tribes thought of the label is a question the setting should keep asking. |
