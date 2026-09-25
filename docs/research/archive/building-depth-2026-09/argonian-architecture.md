# Black Marsh architecture: canonical forms, windows, ESO prior, variety count (research, 2026-09-24)

Headline: no canon source makes any Argonian dwelling windowless; canon puts windows in the Shadowfen mud hut
("dry excreta mixed into the sealing at the edges of windows", UESP Lore:The Improved Emperor's Guide to Tamriel/Black Marsh).
The yard's featureless hutexterior is a kit omission (BM&V shipped windows/doorframes for it; settlement-mud-v1 took none).

## Reconciliation
| Live doc | Covers | Verdict |
|---|---|---|
| world/sources/lore/topics/material-culture.md §Building, §three kits | canon materials per kit | CONFIRMED; lacks an "openings" line (windows, screens, porches) |
| docs/world/97-placement-principles.md Part F | per-culture grammar rows | CONFIRMED; no row states facade requirements or a form count |
| docs/research/placement-settlements/settlement-asset-inventory.md §0, §1, §2 | families and gaps | CONTRADICTED: §1 "two-culture rule (binding)" predates the 2026-09-02 three-kit ruling; §0 "Mud-hut variety CLOSED" counts HTBM bamboo huts (stilt kit) as mud variety, which the never-blend rule forbids |
| docs/research/placement-settlements/kit-assemblies-evidence.md "How to author the composites" | mined house composites | CONFIRMED; item 3 (BM&V house03 + overhang + 4-12 windows) is still unsourced into any kit |
Writer edits: lore openings -> material-culture.md §Building; counts and gap -> settlement-asset-inventory.md §0/§1/§2.

## (1)+(2) Canonical building types
| Culture / tier | Canon look | Windows? | Source |
|---|---|---|---|
| Shadowfen mud hut (commoner) | wattle-and-daub over exposed log skeleton; "bulbous"; "mud nests ... remind me of insect hives"; thatch | YES (window sealing) | Lore:Improved Emperor's Guide/Black Marsh; Lore:Black Marsh ("makeshift, bulbous mud structures and thatch houses") |
| Stormhold "large mud huts" (town tier) | large mud huts beside Dunmer stone | not stated | Lore:Stormhold |
| Murkmire reed/stilt house | woven reed on wooden stilts; platforms ascending, interlinked | YES in ESO prior (branch window/door frames, see 3) | Lore:Argonian §Art and Architecture; Lore:Lilmoth |
| Hist-built / tree village | huts built around a Hist, "village and treehouse" | ESO prior only | Lore:Argonian ("constructing their settlements around it"); PCWorld review |
| Interior grown-root (ours) | trained root, bark shingle, chimes | YES: kit ships window inserts (tronc 7, champ 4, gland 4) | material-culture.md (EXTRAPOLATED) |
| Tree-minder's hall / civic | "a bigger version of a house" | as house | 97 Part F (project) |
| Xanmeer (dead, stone) | stepped pyramids, stone bridges, mazelike interiors, Hist chamber inside | NO: sealed mazes; windowless is the design (warding traps, hidden Hist) | Lore:Xanmeer |
| Imperial colonial | walls, villas (Lilmoth "mould-encrusted villas"), sinking houses, governor's mansion, courthouse, plantation estates | YES | Lore:Lilmoth, Lore:Gideon, lilmoth.md, gideon.md |
| Dunmer (Dres/Hlaalu) border | "ornate stone"; Dunmeri outbuildings (Alten Corimont) | YES | Lore:Stormhold; alten-corimont.md |
| Pirate/shanty | Alten Corimont: docks, Dunmeri outbuildings, beached ship as hub | ship: ports | alten-corimont.md |
| Kothringi remnant | no canon architecture; reed mats, chimes only | unknown | Lore:Kothringi (0 building sentences) |
| Naga / Paatru / Sarpa | no canon architecture | unknown | Lore:Naga, Lore:Paatru, Lore:Sarpa (0 building sentences) |
| Tum-Taleel (Root-House) | build nothing; occupy other tribes' huts; campsites | as occupied hut | Lore:Tum-Taleel |
| Tide-Born (Solstice, off-map) | elevated huts, boma walls, lattice and woven walls, houseboats | lattice/woven screens | ESO furnishings: Tide-Born Hut, Elevated; Tide-Born Wall, Lattice/Woven |
Windowless by design: xanmeer interiors, tents, Orma-marked spaces ("no light wells", lost-peoples.md), dungeons. Nothing domestic.

## (3) ESO Murkmire prior
- ESO design intent: "show players ... what Argonian architecture and culture really is" (Gamereactor, Rich Lambert 2018).
- Structural furnishing names (UESP allpages, ns Online): Argonian Canopy (Reed, Frilled, Scaled, Skull), Argonian Lattice Rough, Argonian Tent Reed, Murkmire Platform/Ramp/Walkway Reed, Murkmire Wall Straight/Corner Curve, Murkmire Gate Arched, Stone-Nest Wall/Pillar/Stair (xanmeer), Tide-Born Wall Lattice/Woven, Tide-Born Hut Elevated.
- Player builders on the ESO forum (Feb 2025, via search extract; page itself 403): Murkmire stilt huts have "branch frames for windows and doors"; roofs are "thatch roofs, circular or angular"; the reed canopy is the only roof piece.
- ESO Stormhold names Argonian dwellings "X's Hut" and Dunmer ones "X's House" (Online:Stormhold: 5 huts, 4 houses) - two vernaculars side by side in one town.
- Images NOT inspected: UESP, fandom and Project Tamriel image hosts return a Cloudflare 403 on this VM. Image pages to view by hand: UESP File:ON-concept-Murkmire Architecture.jpg, File:ON-render-Murkmire 04.jpg, File:ON-place-Ianix's Hut.jpg, File:ON-concept-Argonian Hut.png.

## (4) Variety needed vs what we can build
Target: no doc states a house-form count per culture or tier. 97 A6 (line 131) caps any template at ~25 % of its family in a region,
which needs >= 4 distinct templates per family per region (3 templates force >= 33 %).
| Kit | Dwelling forms now | Window/opening pieces in kit | Meets >=4 |
|---|---|---|---|
| settlement-mud-v1 | 3 (mudhut01 5.9 m, hutexterior 11.6 m round, hutdecking 14.7 m) + 2 tents | 0 (BM&V hut windows/doorframe not taken) | NO |
| settlement-stilt-v1 | 2 (stilthouse 11.3x17.8 m with shutter door; bamboohut01/02 identical 8.2 m) + partial shackkit (6 of 58 pieces, no door/window) | stilthouse door only; shackwallwindow01/02, shackwalltopwindow01, shackwalldoor01 left in vanilla | NO |
| settlement-root-v1 | 3 (housetronc, housechamp, housegland) + kiosk | 15 window inserts, balconies, lianas | NO (3) |
| settlement-imperial-v1 | 2 (farmhouse01, 02) | none as pieces (shell-modelled) | NO; vault has farmhouse03-06, longhouse, inn, 5 city kits unused |
| dunmer-hlaalu (97 Part F row) | 0 - no kit built | vault: morrowind-hlaalu-157997 (house01, housetall01, largewindow00, dome) | NO |
Flat total: 10 dwelling forms across 4 kits (2 bamboo huts are one form), against >= 20 (5 grammars x 4) for the quota alone, before tiers.
Vanilla shackkit composes windows as pieces (mined: shackroofside01 <- shackwallwindow02, 7+7 times; kit-assemblies-mined.json).
BM&V's own Black Marsh houses carry windows (mined groups: house03 + overhang05 + 4-12 `window`, 14+4+3+3 times; house02 + 4-7 windows, 11+4).

## Sources
- UESP (API, en.uesp.net/w/api.php): Lore:Argonian; Lore:Black Marsh; Lore:Xanmeer; Lore:The Improved Emperor's Guide to Tamriel/Black Marsh; Lore:Lilmoth; Lore:Stormhold; Lore:Gideon; Lore:Blackrose; Lore:Kothringi; Lore:Tum-Taleel; Lore:Naga; Lore:Paatru; Lore:Sarpa; Online:Stormhold; Online:Lilmoth; Online:Humblemud; Online:Lakemire Xanmeer Manor; Online:Concept Art/Murkmire; Online:Argonian Furnishings; Online:Murkmire Furnishings; ESO furnishing pages listed above.
- https://www.gamereactor.eu/esos-murkmire-expansion-designed-to-show-argonian-culture/
- https://www.pcworld.com/article/402805/elder-scrolls-online-murkmire-review.html
- https://forums.elderscrollsonline.com/en/discussion/673522/argonian-structures-for-the-luxury-furnisher (search extract; direct fetch 403)
- https://en.uesp.net/wiki/Online:Concept_Art/Murkmire
- https://wiki.project-tamriel.com/wiki/Eye_of_Argonia (fan prior; direct fetch 403)
- https://www.thegamer.com/beyond-skyrim-mod-black-marsh/ (fan prior: Beyond Skyrim "round, mud-like houses of the Knahaten culture")
- https://elderscrolls.fandom.com/wiki/Vvardenfell_Architectural_Styles (Morrowind per-house styles prior)
Raw UESP wikitext: /tmp/wf/buildings/uesp_*.txt
