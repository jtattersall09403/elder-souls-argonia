# Marsh watercraft and Argonian boats — research for Phase 9 (boats), 11 (docks), 13 (fishing)

**Status: inspiration, not prescription.** Canon lives in the dossiers; this doc
maps canon + real-world marsh watercraft onto our boat classes
(docs/world/60-water-traversal.md §45) and water classes (canoe channel, river,
lake, estuary, coast). Real-world material is a **design prior, never canon**.
Researched 2026-08-28 via the UESP MediaWiki API; page names cited per fact.

## 1. What canon gives us (summary — full text in dossiers)

Full canon records: `world/sources/lore/topics/material-culture.md` § Boats and
waterway travel (added with this research), plus `topics/lost-peoples.md`
(Kothringi ships), `tribes.md` (Agaceph tail-raft), `regions/waters.md`
(navigable corridors), `alten-corimont.md` (beached ship as building).

- **Small-draft is the doctrine.** Waterways "only navigable by small-draft
  ships … the most common and the fastest form of transportation … inside
  Argonia" (UESP *Lore:Sea Transportation*). Argonians rarely build large
  ships; big hulls in our ports should read Dunmer (junks, hook-prowed) or
  Imperial (caravels, river rafts) — same page.
- **Native craft are rafts and canoes**: "personal rafts" as the old way of
  moving grain (*Lore:The Argonian Account, Book 4*); the Agaceph razor-thin
  one-person raft **propelled by the tail** (same page); drowned-marsh country
  "navigable by small rafts, canoes, and little else", reached by **ferry
  boats** with a hired guide (*Lore:Tribes of Blackwood: Riverbacks*).
- **Living afloat is canon**: twin-hulled canoes with living platforms
  (catamarans), reef flotillas, houseboats slept in through storms
  (*Lore:Salt-Cured*, *Online:Argonian Houseboat*, *Online:Tide-Born Boat*).
- **The one named native type is Kothringi**: the tidal canoe — shallow draft,
  odd paddle placement, colourful **doubled sail**, swamp- *and* sea-capable
  (*Online:Kothringi Tidal Canoe*, *Lore:Kothringi*). A dead people's design
  that survivors/locals could plausibly still copy — strong candidate for our
  player "sailboat" class with native visual language.
- **Fishing canon** (Phase 13): raft fishing with bridled predator gars doing
  the catching (*Lore:Tribes of Blackwood: Riverbacks*); dawn shallow-water
  fishing boats (*Online:Tide-Born Boat*); harpoons attested for the Kothringi
  (*Lore:Kothringi*).
- **Travel texture**: guided multi-day raft journeys, night legs, "we cannot
  stop" while a Swamp Leviathan trails the boat (*Lore:Lost Tales of the Famed
  Explorer: Fragment III*) — a ready template for ferry/guide gameplay and
  escort quests. Pirate galleys hide in the Onkobra's "many mouths"
  (*Lore:Pirates of Topal Bay*, 2E history).
- **Negative finding**: no canon for grown/organic/Hist-grown boats and no
  native Argonian boat-class names. A ritual/Hist craft (§45's sixth class) is
  ours to invent — label it EXTRAPOLATED and ground it in wood/reed craft, not
  "living hulls".

## 2. Real-world marsh watercraft (design prior)

### 2.1 Iraqi Marsh Arabs (Ma'dan) — the closest whole-culture analogue

Sources: https://en.wikipedia.org/wiki/Marsh_Arabs ·
https://en.wikipedia.org/wiki/Mashoof · https://en.wikipedia.org/wiki/Quffa ·
Wilfred Thesiger, *The Marsh Arabs* (1964).

| Craft | Form | Propulsion | Crew/cargo | Draft | Notes |
|---|---|---|---|---|---|
| **Mashoof** (mashhuf) | long slender plank canoe, **bitumen-coated** | pole in shallows, paddle in open water | 1–4; person-scale loads (fish, reeds, a buffalo calf) | ~10–20 cm | the everyday vehicle: fishing, reed harvest, visiting, school runs |
| **Tarada** | large ornamented war/status canoe, up to ~11 m | crew of paddlers | sheikh + retinue | shallow | **status is expressed as a longer canoe with more paddlers**, not a different hull type |
| **Guffa** (quffa) | round coracle, woven reeds + bitumen | single paddle, spun/sculled | 1–2 crew; famously large cargo loads for size | very shallow | ferry/cargo tub of the Tigris; comic-looking, immensely practical |
| Reed rafts / zaima | bundled-reed hull or raft, bitumen-sealed | pole/paddle | low | negligible | cheap, short-lived, remade seasonally |

Key transferable ideas: **poling is the marsh gait** (silent, works where
paddles foul in weed, needs a bottom within pole reach ~2 m); bitumen answers
"what seals a wooden hull in a rot-everything swamp" — our pitch/resin
equivalent; craft are cheap, short-lived and constantly rebuilt (rhymes with
the Argonian anti-*shunatei* build-to-be-replaced doctrine, dossier
material-culture § Building); **size ladder = social ladder**.

### 2.2 Southeast Asia

Sources: https://en.wikipedia.org/wiki/Sampan ·
https://en.wikipedia.org/wiki/Yuloh · https://en.wikipedia.org/wiki/Tonl%C3%A9_Sap ·
https://en.wikipedia.org/wiki/Dugout_canoe

- **Sampan**: flat-bottomed plank skiff, 3–5 m, **stern-sculled with a yuloh**
  (one person, hands-free-ish, no oarlocks to snag), or paddled/poled; family
  transport, ferrying, market cargo, often lived on under a hooped mat roof.
  Draft ~0.2–0.3 m. The best real-world match for our **skiff/rowboat** class.
- **Tonlé Sap floating villages** (Cambodia): everything — school, shop,
  temple runs — is a paddled small-boat trip; the lake expands severalfold in
  monsoon and villages move with it. Direct model for drifting villages
  (canon: villages move) and for our seasonal flood staging.
- **Dugouts** everywhere as the zero-infrastructure baseline; pre-motor
  longtail equivalents were just long paddled/poled canoes.

### 2.3 Africa / Americas

Sources: https://en.wikipedia.org/wiki/Ganvi%C3%A9 ·
https://en.wikipedia.org/wiki/Makoro · https://en.wikipedia.org/wiki/Pirogue ·
https://en.wikipedia.org/wiki/Reed_boat

- **Ganvié** (Benin): a 20k-person stilt city on a lagoon where **every
  household owns pirogues**; market held boat-to-boat. Model for Blackrose
  boardwalk-city water life and per-house mooring posts.
- **Mokoro** (Okavango): poled dugout, poler **standing in the stern**,
  2 passengers + kit, draft ~0.1–0.2 m, silent — wildlife-viewing craft
  because it doesn't spook game. Our **dugout/canoe** class and stealth prior.
- **Amazon montaria / Louisiana pirogue**: light flat-bottomed plank canoes,
  paddled or poled, "floats on a heavy dew"; one hunter/fisher + catch.
- **Totora reed boats** (Lake Titicaca): bundle-reed hulls that waterlog and
  are rebuilt within months — again the disposable-boat culture; visually
  distinctive upswept prows.

### 2.4 Europe (our "era-parallel" late-medieval tech ceiling)

Sources: https://en.wikipedia.org/wiki/Punt_(boat) ·
https://en.wikipedia.org/wiki/Fen_lighter ·
https://en.wikipedia.org/wiki/Thames_sailing_barge ·
https://en.wikipedia.org/wiki/Cog_(ship) · https://en.wikipedia.org/wiki/Portage

- **Punt**: square-ended flat pole boat for fen cargo (reed, sedge, eels) —
  interchangeable with the mashoof niche.
- **Fen lighters**: barges worked in **towed/poled trains** through drains —
  prior for NPC cargo convoys on our river class ("river trader" §45).
- **Thames sailing barge**: flat-bottomed estuary sailer, ~0.9 m light draft,
  sails a tide upstream and dries out flat on mud at low water — exactly the
  behaviour our estuary class + long tidal reach (waters.md constraint 4)
  wants; crew of 2.
- **Cog**: the sea-trader ceiling (single mast, ~2–3 m draft) — foreign hulls
  only, per canon; they wait at the port cities and never go upriver.
- **Portage**: light craft are carried; heavier ones need rollers/slipways —
  justifies §45's rule that amber portage hops resolve to carved channels *or*
  real portage features (decision 0012).

### 2.5 Rough physics cheat-sheet (prior for tuning, not canon)

Poled craft ~3–5 km/h and need bottom within pole reach; paddled canoes
~5–8 km/h sustained; sculled sampan ~4–6 km/h; sailing barge with a fair tide
~8–12 km/h. Draft ladder: raft/pirogue/mokoro ≤0.2 m → sampan/punt ~0.3 m →
laden river barge 0.5–1 m → estuary sailer ~1 m → seagoing cog 2–3 m. Wind is
useless under tree canopy — **sail only earns its keep on lake, estuary and
coast**, which cleanly justifies the §45 class split.

## 3. Mapping to our boat classes (§45)

| §45 class | Real-world skeleton | Water classes served | Propulsion read |
|---|---|---|---|
| Dugout/canoe | mokoro, pirogue, mashoof | canoe channel, river edges, lake margins | pole (stand) or paddle (sit); silent |
| Skiff/rowboat | sampan, punt | river, lake, sheltered estuary | scull/paddle/pole; 1–2 crew |
| Raft/platform | Ma'dan reed raft, Agaceph tail-raft (canon) | canoe channel, still lake | pole/tail; village-link and cargo float |
| River trader | fen lighter, montaria-scale barge | river, lake, estuary | poled/towed/sculled; NPC convoys |
| Sailboat | Kothringi tidal canoe (canon) over a Thames-barge behaviour model | estuary, coast, big lake | doubled sail + paddle fallback; dries out on mud |
| Ritual/Hist craft | tarada logic: same hull family, longer, ornamented, many paddlers | wherever its village is | paddled procession; EXTRAPOLATED |

Status = scale-of-canoe (tarada logic), not different technology. Foreign hulls
(Dunmer junk, Imperial caravel, pirate galley) are set dressing and quest
objects at ports, not player classes.

## 4. Docks, landings and boatbuilding sites (feeds Phase 11)

Real marsh cultures barely build docks. The ladder observed (Ma'dan, Ganvié,
Tonlé Sap, fens — sources above):

1. **Mud landing / drag ashore** — most villages: a worn bank ramp, boats
   hauled out or tied to a **stake or house post**; canoes stored inverted.
2. **House-post mooring** — stilt settlements: boats tie directly to the
   dwelling; a notched log or short ladder up; boat-to-boat markets.
3. **Timber jetty** — only where hulls with freeboard meet cargo in bulk:
   towns, toll points, ferry heads (canon Riverback ferry, Keel-Sakka toll
   bridge in waters.md).
4. **Quay/pier + careening beach** — the port cities for foreign ships;
   repair = hauling out on a beach, recaulking with pitch (Alten Corimont's
   beached-ship building sits perfectly here).
5. **Boatbuilding site** = any dry shaded bank with timber/reed and a fire for
   pitch — a scatterable POI, not a building type.

Settlement authoring rule of thumb: village = stakes + mud ramps; town = one
jetty; city = quays; everything native floats in ≤0.3 m of water.

## 5. Asset pointers (Phase 9 sourcing job — names only, no downloads)

The live candidate table is **docs/world/90-asset-strategy.md §77** (Sailboats
SSE, L.V.X. Boats, Skyrim Ferries, Rowboats of Skyrim, ThatShipGuy, vanilla
hulls) and the animation position is **§74.3** (no vanilla rowing clips; seated
pose + procedural oar/tiller). Vanilla Skyrim itself offers: the rowboat
(clutter/common), the large trade-ship kit and shipwreck variants, dock/pier
kits, and fishing clutter (nets, baskets; CC Fishing adds more).

Gaps this research exposes that §77's pool does **not** obviously cover —
flag for the Phase 9 sourcing agent: a **poled raft/platform**, a true
**dugout canoe**, a **twin-hulled platform canoe** (Salt-Cured), a
**houseboat**, and an ornamented **procession canoe**. Search the mod scene
for canoe/raft/houseboat resources before concluding a class is unsourceable;
kitbashing vanilla rowboat + planks for the raft is a legal fallback (assembly,
not new art).

## 6. Open questions

1. Player propulsion feel: do we animate poling (needs a standing pose +
   procedural pole IK) or ship only paddled/sculled craft per §74.3's
   seated-pose preference? Poling is *the* marsh signature — worth one clip hunt.
2. Do boats ground softly on mud (Thames-barge dry-out, gameplay-friendly) or
   take hull damage (§45 lists both grounding and damage)?
3. Is the ritual/Hist craft a procession canoe (tarada logic, this doc) or
   something stranger? Needs an owner steer before quest content binds to it.
4. Do we adopt bitumen/pitch ("swamp tar") as a named material for boat repair
   and waterproofing loops? Cheap, lore-plausible, gives docksides an industry.
5. Tide-Born twin-hull flotilla: worth a drifting offshore micro-settlement
   instance (canon supports it) — Phase 11/15 decision.
