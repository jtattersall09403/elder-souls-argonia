# Settlement design principles — external source review

**Status:** evidence gathering, 2026-09-05. Online research only; a separate
synthesis agent turns this into placement and design rules for the province.
Nothing here is a rule. Every claim carries its source.

**Scope note.** This document deliberately avoids ground already held in
`marsh-settlement-morphology.md` (marsh ethnography and archaeology),
`openworld-place-distribution-and-siting.md` (density, spacing, pull),
`openworld-approach-and-wayfinding.md` (staging the approach, Lynch applied),
`kit-level-design-and-layout-generation.md` (kit anatomy, snap facts) and
`shipped-world-placement-rules.md` (mined numbers). It supplies what those lack:
academic urban morphology, procedural settlement generation, the pattern
language with pattern numbers, developer talks beyond Bethesda, the wayfinding
salience literature, and Creation Kit authoring convention.

---

## 1. Real-world settlement morphology

### 1.1 Site versus situation

Settlement geography separates **site** — the physical land a settlement
occupies — from **situation** — its position relative to everything around it.
Site explains why a settlement exists at a given spot; situation explains
whether it grows into a city or stays a hamlet, since situation governs
accessibility and reach to resources
([geographyfieldwork.com](https://geographyfieldwork.com/SiteSituation.htm);
[coolgeography.co.uk](https://www.coolgeography.co.uk/GCSE/Year%2010/Human%20World/Settlement%20factors/Settlement%20factors.htm)).
The standard site typology is short and directly usable:

- **Bridging point** — where a river is shallow enough to ford or narrow enough
  to bridge. The *lowest* bridging point (the crossing nearest the sea) is the
  classic river-port site; English place names in `-ford` record the type
  (Watford on the Colne, Newcastle on the Tyne)
  ([geographyfieldwork.com](https://geographyfieldwork.com/SiteSituation.htm)).
- **Confluence and nodal point** — where valleys or rivers meet, e.g. Khartoum
  at the Blue and White Nile, Allahabad at the Ganga–Yamuna junction
  ([brainkart.com](https://www.brainkart.com/article/Site-and-Situation_41092/)).
- **Spring line (wet point)** — settlements strung along the junction of
  permeable and impermeable strata, as at the foot of the North and South
  Downs; the settlement exists because the water surfaces exactly there
  ([coolgeography.co.uk](https://www.coolgeography.co.uk/GCSE/Year%2010/Human%20World/Settlement%20factors/Settlement%20factors.htm)).
- **Dry point** — ground raised just enough above a floodable surround, e.g.
  Ely in the Cambridgeshire fens
  ([geographyfieldwork.com](https://geographyfieldwork.com/SiteSituation.htm)).
- **Defensive spur and meander** — crags and incised meanders that give water
  or cliff on three sides: Edinburgh's crag, Durham and Shrewsbury inside
  meander loops, Corfe on its ridge gap
  ([coolgeography.co.uk](https://www.coolgeography.co.uk/GCSE/Year%2010/Human%20World/Settlement%20factors/Settlement%20factors.htm)).
- **Gap town** — a settlement commanding a pass between higher ground, e.g.
  Lincoln ([coolgeography.co.uk](https://www.coolgeography.co.uk/GCSE/Year%2010/Human%20World/Settlement%20factors/Settlement%20factors.htm)).

The important structural point for a generated world: these are *reasons*, and
they are mutually reinforcing. A settlement usually sits where two or three
coincide — a dry point at a confluence that also happens to be the lowest
bridging point.

### 1.2 Conzen: plan units, plot series, the burgage cycle

M. R. G. Conzen's *Alnwick, Northumberland: A Study in Town-Plan Analysis*
(1960) defined the morphogenetic reading of townscape. He decomposes the town
into **plan elements** — streets, plots and buildings — and groups areas of
morphological homogeneity into **plan units**, each recording one phase of
growth; he further separates three form complexes, the town plan, the building
fabric and the land utilisation, which change at different rates
([urbandesignlab.in](https://urbandesignlab.in/urban-morphology-theories-exploring-the-evolution-from-conzen-to-space-syntax/);
[ResearchGate summary](https://www.researchgate.net/publication/240739085_Conzen_MRG_1960_Alnwick_Northumberland_A_study_in_town-plan_analysis_Institute_of_British_Geographers_Publication_27_London_George_Philip)).

The **burgage cycle** describes the progressive infilling of plot backlands
with buildings, running through an institutive phase (initial plot structure
laid out), a repletive phase (backland progressively built over) and a climax
phase, terminating in clearance and a period of urban fallow before
redevelopment ([burgageplots.info glossary](https://www.burgageplots.info/glossary-of-terms);
[ResearchGate figure](https://www.researchgate.net/figure/Different-phases-of-the-Burgage-Cycle-by-Conzen-1960-expressed-as-variation-in_fig1_329909014)).
Conzen also identified **fringe belts** — bands of low-density, large-plot land
uses laid down at a moment when the built edge paused
([urbandesignlab.in](https://urbandesignlab.in/urban-morphology-theories-exploring-the-evolution-from-conzen-to-space-syntax/)).
The critique of the tradition, worth recording: it is descriptive and
place-specific, with limited predictive power
([urbandesignlab.in](https://urbandesignlab.in/urban-morphology-theories-exploring-the-evolution-from-conzen-to-space-syntax/)).

**Burgage plots** are the basic cells of medieval plan analysis: long, narrow,
arranged in series along a street, extending back from a frontage to a rear
boundary, maximising street frontage; the front strip carried the shop,
workshop or tavern
([burgageplots.info](https://www.burgageplots.info/a-planned-approach);
[RuralHistoria](https://ruralhistoria.com/2023/12/04/what-is-a-medieval-burgage-plot/)).
Plot dimensions were prescribed and are recoverable: primary Salisbury plots
were three poles wide by seven deep, and Charmouth's charter of 1320
prescribed four perches by twenty
([burgageplots.info](https://www.burgageplots.info/a-planned-approach)).
Plots were subdivided lengthways and widthways over time without erasing the
earlier boundaries, which is why the pattern stays legible
([burgageplots.info](https://www.burgageplots.info/a-planned-approach)).
T. R. Slater, "The Analysis of Burgage Patterns in Medieval Towns", *Area* 13:3
(1981), is the standard method reference
([burgageplots.info](https://www.burgageplots.info/a-planned-approach)).

### 1.3 The market place and street hierarchy

Market shape is the defining element of a market town's plan, and a small
number of shapes recur: the long wide main street; the **triangular** market,
which forms where three roads meet, as at Bampton, Oxfordshire; and the
rectangular market at a T-junction of major roads, as at Blandford
([burgageplots.info](https://www.burgageplots.info/a-planned-approach);
[Dorset Council, Blandford HUCA](https://www.dorsetcouncil.gov.uk/documents/35024/292799/Blandford_Part_6_Historic_Urban_Character_Area_1_February_2011.pdf/22e9d26a-4467-d2e9-bdb7-40834e9b7005)).
Planted (deliberately founded) towns were not necessarily gridded: many were
organised around the market, or around a short stretch of highway simply
*widened* to make a market place, or around the road linking market to castle
or abbey; buildings still stood hard on the street frontage
([ORB, medieval English urban history](https://the-orb.arlima.net/encyclop/culture/towns/townint5.html)).
Seigneurial foundation of new market centres peaked in the twelfth and
thirteenth centuries ([ORB](https://the-orb.arlima.net/encyclop/culture/towns/townint5.html)).

The street hierarchy that follows is consistent: high street → cross street →
back lane → alley. At Hungerford, burgage plots ran along both sides of the
north–south through-road and terminated at back lanes, with a later series
along part of the cross street — and the settlement focus had shifted from the
church to the junction of the two through-roads
([burgageplots.info](https://www.burgageplots.info/a-planned-approach)).
Back lanes run parallel behind the frontages with short linking lanes serving
the plots ([Dorset Council](https://www.dorsetcouncil.gov.uk/documents/35024/292799/Blandford_Part_6_Historic_Urban_Character_Area_1_February_2011.pdf/22e9d26a-4467-d2e9-bdb7-40834e9b7005)).
Two later processes are visible in the fabric: **encroachment**, where
buildings infill the original market space (Burford, Thame), and
**specialisation**, where a large market subdivides into named trading spaces
recorded by street names such as Buttermarket and Cornmarket
([burgageplots.info](https://www.burgageplots.info/a-planned-approach)).

### 1.4 Water-facing vernacular traditions

**Malay kampung and SE Asian stilt villages.** The Malay house is long and
narrow, its longitudinal axis typically east–west, which both faces Mecca and
minimises the elevation exposed to solar gain; the long sides then take the
monsoon winds for cross ventilation
([Ng, *Rumah Kampung*](https://medium.com/@danielcfng/rumah-kampung-the-harmony-of-tradition-environment-and-culture-in-malay-architecture-9382e9385532)).
Village layout is **deliberately non-gridded**: an apparently random
arrangement of houses keeps wind velocity up for houses downwind, where
uniform rows would block airflow
([Ng](https://medium.com/@danielcfng/rumah-kampung-the-harmony-of-tradition-environment-and-culture-in-malay-architecture-9382e9385532)).
Stilts raise the floor above flood level and ground damp in a climate near 75%
humidity, and additionally reach faster air at body height
([Ng](https://medium.com/@danielcfng/rumah-kampung-the-harmony-of-tradition-environment-and-culture-in-malay-architecture-9382e9385532);
[Into the Ulu](https://intotheulu.com/2014/07/25/building-houses-in-the-air/)).
A readable frontage cue: the stair connects the *land* front of the house to
the serambi (verandah), so stair direction records which way the house faces
([Ng](https://medium.com/@danielcfng/rumah-kampung-the-harmony-of-tradition-environment-and-culture-in-malay-architecture-9382e9385532)).
The hot-humid kit — elevated floor over a ventilated undercroft, deep eaves,
high-pitched roof, porous walls, shaded verandah, reconfigurable partitions —
is documented as a coherent response to heat plus pluvial and fluvial flooding
([ICIE proceedings, Rumah Panggung](https://proceeding.pancabudi.ac.id/index.php/ICIE/article/view/794)).
A caveat the sources supply themselves: measured indoor temperatures in Negeri
Sembilan reached 35 °C at peak, because orientation in practice was mediated by
religious and site constraints rather than climate optimisation
([ICIE](https://proceeding.pancabudi.ac.id/index.php/ICIE/article/view/794)).

**Amazonian riverine settlement.** Pre-Columbian settlement concentrated along
the major rivers, explained by the superior soils and fish of the várzea
floodplain against the terra firme interfluves
([Denevan, *A Bluff Model of Riverine Settlement in Prehistoric Amazonia*, Annals AAG 1996](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1467-8306.1996.tb01771.x)).
Denevan's correction is the interesting part for siting: because even the
highest floodplain terrain floods periodically, most settlement sat *not* in
the floodplain but on **valley-side bluff tops adjacent to the active
channel**, with subsistence combining periodic use of playa and levee soils
with stable bluff-edge gardens and agroforestry
([Denevan 1996](https://www.researchgate.net/publication/227668217_A_Bluff_Model_of_Riverine_Settlement_in_Prehistoric_Amazonia)).
Where houses do sit on the floodplain they string along the natural levee, the
highest ground immediately flanking the channel, within a mosaic of levees,
lakes, dried lake beds, swampy depressions and mudflats whose habitat depends
on a few centimetres of elevation
([Amazon Waters, *Floodplain or Várzea*](https://en.aguasamazonicas.org/fisheries/fishing/floodplain-or-varzea)).
The flooded area of the Amazon varies between roughly 10,000 and 81,000 km²
seasonally ([Amazon Waters](https://en.aguasamazonicas.org/fisheries/fishing/floodplain-or-varzea)).
Contemporary ribeirinho economies combine agriculture, fishing and small stock,
and have moved toward closing lakes as informal community reserves
([Ecology & Society](https://ecologyandsociety.org/vol30/iss3/art33/)).

**Venice — accretion by parish cell.** Venice grew around parish nuclei, not on
a plan; islands formed around a parish church, and irregular street boundaries
mark the seams where reclaimed islands met
([Venezia Unica](https://www.veneziaunica.it/en/content/urban-planning-and-minor-architecture-venice)).
The repeated module is compact and worth naming: **one church per island, its
open rectangular or polygonal campo in front, a communal well, at least one
canal along a side for transport, houses extending outward**, with every street
eventually leading to the campo
([Venezia Unica](https://www.veneziaunica.it/en/content/urban-planning-and-minor-architecture-venice);
[Best Venice Guides, Campo San Polo](https://bestveniceguides.it/en/2019/07/05/campo-san-polo-in-venice/)).
The street vocabulary is typed by relation to water and width: a *calle* runs
between two continuous rows of buildings, from under a metre for the narrowest
*calliette* to three or four metres for a *calle larga*; a *fondamenta* runs
alongside a canal; a *rio terà* is a filled-in canal
([Wikipedia, Calle](https://en.wikipedia.org/wiki/Calle_(Venetian_street))).
The city was divided into six sestieri in 1171, three each side of the Grand
Canal ([Venezia Unica](https://www.veneziaunica.it/en/content/urban-planning-and-minor-architecture-venice)).

**Amsterdam — regulated plot extension.** The canal ring was designed at the
end of the sixteenth century and built in the seventeenth as an entirely
artificial port city, a polygonal crescent of kinked straights concentric about
the medieval core and radiating from Dam Square, structured to maximise
waterfront access for merchant warehouses and so producing narrow-fronted
buildings ([UNESCO Urban Heritage Atlas](https://whc.unesco.org/en/urban-heritage-atlas/Amsterdam/)).
Plot width and depth were fixed by municipal ordinance (*keuren*): about 30
Amsterdam feet (~8.5 m) on the Herengracht against 22 on the Prinsengracht, and
that regulated variation is what produces the differing architectural character
of each canal ([UNESCO](https://whc.unesco.org/en/urban-heritage-atlas/Amsterdam/)).
The canal house was multifunctional — dwelling, office and warehouse in one —
with gardens and craftsmen's houses behind
([UNESCO](https://whc.unesco.org/en/urban-heritage-atlas/Amsterdam/)).
The general pre-industrial waterfront logic the sources draw out: loading,
warehousing, coordination and dwelling all had to sit close together and close
to water ([UNESCO](https://whc.unesco.org/en/urban-heritage-atlas/Amsterdam/)).

The contrast between Venice and Amsterdam is the useful one: **incremental
parish-cell accretion with irregular seams**, against **regulated speculative
plot extension on planned water lines** — two water towns that share the
dwelling-warehouse hybrid fronting navigable water and differ in everything
else.

---

## 2. Procedural and academic settlement generation

### 2.1 Parish & Müller, and CityEngine

Parish and Müller, "Procedural Modeling of Cities" (SIGGRAPH 2001), generate a
city from **image maps** — land–water boundaries, elevation, population density
— by growing a road network with L-systems, then subdividing the enclosed land
into lots and generating building geometry on the allotments
([SIGGRAPH History](https://history.siggraph.org/learning/procedural-modeling-of-cities-by-parish-and-muller/)).
The technical contribution most relevant here is the extension of L-systems
with **global goals and local constraints**: the global goal proposes the next
road segment (e.g. toward population density), the local constraint adjusts or
rejects it against terrain and existing geometry, which keeps the production
rules small ([SIGGRAPH History](https://history.siggraph.org/learning/procedural-modeling-of-cities-by-parish-and-muller/);
[Semantic Scholar](https://www.semanticscholar.org/paper/95c8a50d378638302c88baa0ad3472ee2c2306e4)).
The system became CityEngine, later reframed on the CGA shape grammar and now
shipped by Esri ([SIGGRAPH History](https://history.siggraph.org/learning/procedural-modeling-of-cities-by-parish-and-muller/)).
A documented critique: the L-system adds implementation complexity that simpler
growth algorithms avoid for equivalent results
([SIGGRAPH History](https://history.siggraph.org/learning/procedural-modeling-of-cities-by-parish-and-muller/)).

### 2.2 Watabou's Medieval Fantasy City Generator

The generator began as little more than a city-shaped Voronoi diagram and grew
into a detailed map generator; the author is explicit that **the method is
arbitrary and the goal is a good-looking map, not an accurate model of a city**
([Watabou, MFCG](https://watabou.itch.io/medieval-fantasy-city-generator);
[Breaking the 4th Wall review](https://bt4wall.wordpress.com/2018/05/28/medieval-fantasy-city-generator-by-watabou/)).
Its structure is nonetheless instructive. The city subdivides into **wards** of
typed kinds (craftsmen, military and so on); adjacent wards of the same type
group into **neighbourhoods**, primarily so a cluster of three craftsmen wards
takes a single label near the cluster centre rather than three
([devlog 0.5.3](https://watabou.itch.io/medieval-fantasy-city-generator/devlog/34104/053-neighbourhoods-alleys-and-buildings)).
Ward interiors then fill with alleys and building lots, and the alley planner
was iterated repeatedly, especially for military wards
([devlog 0.5.3](https://watabou.itch.io/medieval-fantasy-city-generator/devlog/34104/053-neighbourhoods-alleys-and-buildings)).
The work is polygon geometry rather than simulation: polygon offsetting
(buffering) was rewritten to stop streets narrowing abruptly, and label
placement uses the straight skeleton
([devlog 0.5.3](https://watabou.itch.io/medieval-fantasy-city-generator/devlog/34104/053-neighbourhoods-alleys-and-buildings);
[devlog 0.11.1](https://watabou.itch.io/medieval-fantasy-city-generator/devlog/715292/0111-improved-map-labels)).
Feature presence — walls, river, castle, gate count — is exposed as direct
user control rather than emerging from simulation, and wall-less layouts plus
outskirts arrived at 0.3.0
([devlog 0.3.0](https://watabou.itch.io/medieval-fantasy-city-generator/devlog/3091/030-wall-less-layouts-city-outskirts-smooth-roads)).
Later refinements recorded by users: less acute wall corners, farmhouses moved
to field edges rather than field centres, and castles permitted inside the
walls rather than always attached to them
([ProFantasy forum](https://forum.profantasy.com/discussion/10489/watabou-medieval-fantasy-city-generator)).

### 2.3 Space syntax

Space syntax originates at the Bartlett in the late 1970s and is codified in
Hillier and Hanson, *The Social Logic of Space* (1984)
([ResearchGate synopsis](https://www.researchgate.net/publication/350176023_Bill_Hillier's_Legacy_Space_Syntax-A_Synopsis_of_Basic_Concepts_Measures_and_Empirical_Application)).
The **axial map** represents a street layout as the fewest longest lines of
sight and movement, from which connectivity and global and local integration
are computed; the high-integration lines form the **integration core**
([ResearchGate synopsis](https://www.researchgate.net/publication/350176023_Bill_Hillier's_Legacy_Space_Syntax-A_Synopsis_of_Basic_Concepts_Measures_and_Empirical_Application)).
**Intelligibility** is a second-order measure: the correlation between a line's
local connectivity and its global integration — that is, how far one can infer
a space's position in the whole from what is visible locally
([ResearchGate synopsis](https://www.researchgate.net/publication/350176023_Bill_Hillier's_Legacy_Space_Syntax-A_Synopsis_of_Basic_Concepts_Measures_and_Empirical_Application)).
**Natural movement** (Hillier, Hanson, Grajewski and Xu, *Environment and
Planning B*, 1993) holds that spatial configuration is itself a primary
determinant of movement, prior to attractors; cities are "mechanisms for
generating contact", and grid structure, land-use distribution and building
density combine into a movement economy — with integration correlating better
with observed movement in more intelligible areas
([ResearchGate synopsis](https://www.researchgate.net/publication/350176023_Bill_Hillier's_Legacy_Space_Syntax-A_Synopsis_of_Basic_Concepts_Measures_and_Empirical_Application)).

Disagreements are on record and matter. Chang and Penn (1998) found multi-level
London configurations unintelligible, explaining poor movement correlation;
Hillier and Iida (2005) showed that changing from axial to segment
representation and from topological to angular analysis shifted movement
correlations from −13% to +54% **with no configurational change**, which casts
doubt on the robustness of the intelligibility index; Hillier, Yang and Turner
(2012) responded with normalised measures (NACH/NAIN)
([ResearchGate synopsis](https://www.researchgate.net/publication/350176023_Bill_Hillier's_Legacy_Space_Syntax-A_Synopsis_of_Basic_Concepts_Measures_and_Empirical_Application)).
Penn argues the same principles transfer to building interiors
([The CCD, "Why the Axial Line?"](https://theccd.org/spotlight-research/space-syntax-and-spatial-cognition-or-why-the-axial-line/)).
There is also a known edge effect on global integration, mitigated but not
removed by local radius-3 measures, so an analysed area needs a spatial buffer
([ResearchGate synopsis](https://www.researchgate.net/publication/350176023_Bill_Hillier's_Legacy_Space_Syntax-A_Synopsis_of_Basic_Concepts_Measures_and_Empirical_Application)).

### 2.4 A Pattern Language — the patterns worth having, with numbers

Pattern numbers verified against a full list of the 253 patterns
([Clayton Dorge, list of 253 patterns](https://claytondorge.com/patterns-list)).

Town and settlement scale: **3 City Country Fingers**, **10 Magic of the City**,
**13 Subculture Boundary**, **17 Ring Roads**, **24 Sacred Sites**, **25 Access
to Water**, **30 Activity Nodes**, **31 Promenade**, **36 Degree of Publicness**,
**37 House Cluster**, **38 Row Houses**, **49 Looped Local Roads**, **50 T
Junctions**, **51 Green Streets**, **52 Network of Paths and Cars**, **53 Main
Gateways**, **60 Accessible Garden**, **61 Small Public Squares**, **62 High
Places**, **66 Holy Ground**, **67 Common Land**
([Clayton Dorge](https://claytondorge.com/patterns-list)).

Building-group and site scale: **95 Building Complex**, **98 Circulation
Realms**, **104 Site Repair**, **105 South Facing Outdoors**, **106 Positive
Outdoor Space**, **107 Wings of Light**, **108 Connected Buildings**, **110
Main Entrance**, **112 Entrance Transition**, **114 Hierarchy of Open Space**,
**120 Paths and Goals**, **121 Path Shape**, **122 Building Fronts**, **171
Tree Places** ([Clayton Dorge](https://claytondorge.com/patterns-list)).

Content of the three that carry most weight for siting:

- **104 Site Repair** — build where the site is *worst*, not best; leave the
  already healthy and beautiful ground alone, build around trees rather than
  clearing them, and keep open space to the south
  ([patternlanguage.cc, Site Repair (104)](https://patternlanguage.cc/Patterns/Site-Repair-(104))).
- **105 South Facing Outdoors** — outdoor space is used when it is sunny, so
  the building sits to the *north* of its outdoor space, with no wide shaded
  band between building and sun; in desert climates people prefer a balance of
  sun and shade ([review of 104–152](https://www.scribd.com/document/867505721/A-PATTERN-LANGUAGE-Book-review-104-152-1)).
- **106 Positive Outdoor Space** — space merely left over between buildings
  goes unused; make every outdoor space partly enclosed by wings of buildings,
  trees, hedges, fences, arcades or trellises, breaking negative L-shaped
  residue into positive pieces, while every space still opens onto a larger one
  so it is not over-enclosed (which is **114 Hierarchy of Open Space**)
  ([patternlanguage.cc, Positive Outdoor Space (106)](https://patternlanguage.cc/Patterns/Positive-Outdoor-Space-(106));
  [Hierarchy of Open Space (114)](https://patternlanguage.cc/Patterns/Hierarchy-of-Open-Space-(114))).

Alexander flags 104–106 as the moment buildings are fixed on the site according
to the site, the trees and the sun, and calls it one of the most important
moments in the language
([review of 104–152](https://www.scribd.com/document/867505721/A-PATTERN-LANGUAGE-Book-review-104-152-1)).

---

## 3. Game level design practice

### 3.1 Bethesda: kits, metrics and repetition

Burgess and Purkeypile's GDC 2013 "Skyrim's Modular Level Design" supplies hard
numbers ([Game Developer article version](https://www.gamedeveloper.com/design/skyrim-s-modular-approach-to-level-design);
[full transcript](http://blog.joelburgess.com/2013/04/skyrims-modular-level-design-gdc-2013.html);
[slides](https://www.slideshare.net/JoelBurgess/gdc2013-kit-buildingfinal)).

- A character is about **128 units, or six feet**, tall; that is the metric
  everything else is sized against.
- Minimum traversable space is **two character widths**, below which AI pathing
  breaks.
- AI handles **60-degree** inclines, but **30–45 degrees** is recommended for
  animation to look right.
- Designers typically snap at **half the footprint size**.
- The Cave kit spans **seven sub-kits** and appears in **200+ locations**, with
  ~50 pieces in the small-hallway sub-kit; the Ratway kit is used **twice**,
  with three sub-kits and seven pieces per hallway sub-kit.
- **Two full-time kit artists** produced **seven kits** supporting **eight
  level designers**, who built **400+ unique interior cells in 2.5 years**.

Craft rules from the same talk: do not front-load unique hero pieces — spend on
the standard pieces used hundreds or thousands of times, and add hero pieces
later. **Players notice repeated detail elements far faster than repeated broad
architecture, especially in first person**; the counters are to divorce
architectural identity from inhabitant type and to encourage kit-bashing across
kits. The footprint is the full grid bound, not the traversable space: alcoves
and wall thickness must live *inside* it or they block adjacent placement, and
floor thickness must be predetermined when stacking or ceilings and floors go
co-planar and z-fight. "Snap to reference" permits arbitrary rotation off the
90-degree grid, which is how the Ratway's organic pivot-and-flange hallways
were made; shell-based building sets rooms with grid pieces and then places
walls, pillars and balconies freely. Naming conventions must be consistent and
must not over-abbreviate — `UtlBayCorInMidPRTT01L01` is cited as the failure
case. The workflow runs concept → proof (1–3 weeks) → graybox (1–4 weeks) →
build-out (months) → polish, with the level designer stress-testing throughout
and both parties resisting "patch-up pieces" instead of fixing the footprint
([Game Developer](https://www.gamedeveloper.com/design/skyrim-s-modular-approach-to-level-design)).
The 2016 sequel talk applies the same method to Fallout 4, framed explicitly as
a production-throughput problem: many high-quality locations in a short window
demand modular kits, and the kits are what let a relatively small content team
fill an open world
([GDC Vault, Fallout 4's Modular Level Design](https://gdcvault.com/play/1023202/-Fallout-4-s-Modular);
[slides](https://www.slideshare.net/slideshow/gdc-2016-modular-level-design-of-fallout-4/59770460)).

### 3.2 Bethesda: city layout intent

Bethesda's own city design material, presented by Emil Pagliarulo in 2019 and
excerpted publicly, states that Whiterun is essentially Edoras from *The Lord
of the Rings* and is the most "pure" Nord city; its archaic wooden palisade and
mountain-flank position are deliberate characterisation rather than oversight
([UESP, Skyrim Cities' Design Excerpts](https://en.uesp.net/wiki/General:Skyrim_Cities%27_Design_Excerpts), via search summary).
The vertical layout encodes social structure: the Cloud District is the
smallest of three, named for its height, dominated by Dragonsreach, and its
adjacency to the Wind District is said to express how few barriers Nord culture
puts between nobility and commoners; the Plains District carries shops and
market, the Wind District is mostly residential
([UESP excerpts](https://en.uesp.net/wiki/General:Skyrim_Cities%27_Design_Excerpts)).
A player-side density analysis counts **21 buildings in Whiterun, 16 of which
hold at least one quest, unique treasure or potential follower**, which is why
its residences feel worth entering
([Hothead Collective, Lessons Learned: Skyrim City Design](https://www.hotheadcollective.com/lessons-learned-skyrim-city-design/)).
Another write-up notes it is deliberately reachable early, visible from
distance, and revealed at the crest of a rise
([jleales](https://jleales.wordpress.com/2014/03/21/an-architectural-response-to-the-elder-scrolls-skyrim/)).

### 3.3 Navmesh as a constraint on layout

Navmesh boundaries govern where sandboxing NPCs may end up, and mismatches
between edited and vanilla navmesh in a city cell produce the classic failure
of actors wandering outside the walls, because it is the same cell and the
outside navmesh is unmodified
([gamesas, NavMesh Bug(s) thread](https://gamesas.com/navmesh-bug-part-iii-t258581-100.html)).
Engine limits reported by modders: pathfinding code is effectively hard-coded
and is worked around with waypoints and packages rather than fixed; the engine
only permits furniture use through AI packages, so NPCs cannot opportunistically
use arbitrary markers; and long-distance travel AI degrades, with NPCs
oscillating indefinitely, the common fix being intermediary waypoints at package
level rather than navmesh edits
([gamesas, pathfinding improvement](https://www.gamesas.com/pathfinding-improvement-question-t210714.html);
[Modern NPC Pathing](https://www.nexusmods.com/skyrimspecialedition/mods/185413?tab=description)).

### 3.4 Other studios

**Nintendo, BotW.** The "triangle rule" comes from CEDEC 2017 — Fujibayashi and
senior lead artist Makoto Yonezu, "Field Level Design in *The Legend of Zelda:
Breath of the Wild*", translated by Matt Walker — and not from the separate GDC
2017 session "Breaking Conventions with Breath of the Wild"
([Nintendo Life](https://www.nintendolife.com/news/2017/10/zelda_breath_of_the_wilds_ingenious_design_is_all_about_triangles_apparently);
[80.lv](https://80.lv/articles/the-design-secrets-of-breath-of-the-wild)).
Triangular masses — mountains, buildings — create both surprise ("what is
behind this outcrop?") and choice (left, right, or over), give a peak to head
toward, and hide secrets that reward the detour
([Nintendo Life](https://www.nintendolife.com/news/2017/10/zelda_breath_of_the_wilds_ingenious_design_is_all_about_triangles_apparently)).
The companion rule is that **obstacles must differ in size**: large landmarks
beckon from afar while mid-sized masses block sightlines, and careful design of
the player's horizon removes the need for navigation aids
([80.lv](https://80.lv/articles/the-design-secrets-of-breath-of-the-wild);
[Radiator Blog analysis](https://www.blog.radiator.debacle.us/2017/10/open-world-level-design-spatial.html)).

**Sucker Punch, Ghost of Tsushima.** The Guiding Wind exists to strip the HUD
without leaving the player aimless: a touchpad swipe raises a gust toward the
objective in place of an arrow or map marker, complemented by landmark
navigation — a fox, a bird, a column of smoke on the horizon
([Game Developer](https://www.gamedeveloper.com/design/using-vorticles-to-simulate-wind-in-i-ghost-of-tsushima-i-);
[GDC Vault, "Blowing from the West"](https://gdcvault.com/play/1027124/Blowing-from-the-West-Simulating)).
Technically it is deliberately cheap: the wind velocity model is largely a
single vector, with particle systems adding higher-frequency curl, and
Rockenbeck describes the approach as heuristics and hacks prioritising volume
over accuracy ([Game Developer](https://www.gamedeveloper.com/design/using-vorticles-to-simulate-wind-in-i-ghost-of-tsushima-i-)).

**FromSoftware, Elden Ring.** Guidance of Grace draws gold lines on the map
toward the next objective, and resting at *some* sites emits a golden trail of
dust through the sky — only those pointing at a landmark that leads to a quest
or dungeon; beyond that there are no quest markers, and each region's map must
first be found at an obelisk
([Attack of the Fanboy](https://attackofthefanboy.com/guides/elden-ring-what-are-the-gold-lines-near-sites-of-grace/)).
Soft gating is deliberate: players follow the initial guidance from western
Limgrave and are turned away at Stormveil's bridge, which exists to remind them
the space is large and there is much else to do
([Gamerant, progression route](https://gamerant.com/elden-ring-best-progression-route-path-location-levels-bosses/)).
Legacy dungeons keep the older Souls shape — winding looping paths, self-
contained arcs and bosses, unlockable shortcuts, verticality — with Stormveil
the exemplar, and roughly a third of that level sitting on the roofs, "another
level to the level"
([A Banana Peeled](https://abananapeeled.com/fun/elden-ring-and-elegant-level-design)).
Leyndell illustrates landmark navigation inside a built place: the main road
west to two huge statues, then a massive tree root as the orienting mass for
the ascent, with enemies positioned on it as confirmation that the route is
right ([MMOGah, Leyndell guide](https://www.mmogah.com/news/elden-ring/guide-to-the-leyndell-legacy-dungeon-in-elden-ring)).
A dissent worth carrying: a working level designer argues most Souls-like
analysis fixates on one-way doors and shortcuts and rarely addresses the
methodology of constructing interconnected worlds
([Bramasole, Medium](https://medium.com/@bramasolejm030206/preface-ec08bc1459d0)).

**CD Projekt, The Witcher 3.** Miles Tost describes the open-world job as
taking wide empty space and filling it, while asking how repeated elements such
as forests are justified, how redundancy is avoided and how interest is
sustained; the quest-designer workflow is that a quest designer arrives needing
an ancient ruin, and the level designer finds free space and builds one
([Wccftech Q&A reprint](https://wccftech.com/the-witcher-3-dev-answers-questions-level-design/);
[GOG, Stories From the Path](https://www.gog.com/blog/stories-from-the-path-with-miles-tost/)).
He confirms two classes of location: those whose story Geralt narrates via his
senses, and those that stand alone and are left to the player's imagination
([Wccftech](https://wccftech.com/the-witcher-3-dev-answers-questions-level-design/)).
The CDPR AnsweRED podcast episode 30 is the long-form level-design source with
a full transcript
([CDPR](https://www.cdprojektred.com/en/blog/188/answered-podcast-episode-30-paths-and-possibilities-the-art-of-level-design-transcript-included)).

**Rockstar, RDR2.** Town design carries theme rather than only function.
Valentine's muddy streets, marked by rain and driven livestock, read as a
lived-in frontier town; Saint Denis is the largest city and is deliberately
oppressive and claustrophobic against the open countryside, its cramped
marketplace and heavy lawman presence making the player unwelcome and pushing
restrained play ([Screen Rant, towns ranked](https://screenrant.com/rdr2-towns-ranked-valentine-saint-denis-blackwater/);
[Medium, The Art of RDR2](https://medium.com/@danial.alimadad/stories-woven-in-blood-dust-and-tears-the-art-of-red-dead-redemption-2-be3fa22aa364)).
Saint Denis is closely modelled on New Orleans
([Mighty Travels](https://www.mightytravels.com/2024/04/exploring-the-real-life-roots-of-red-dead-redemption-2s-iconic-towns/)).
The recorded critique: the world is a stable, predictable system serving the
narrative rather than a simulation
([Medium](https://medium.com/@danial.alimadad/stories-woven-in-blood-dust-and-tears-the-art-of-red-dead-redemption-2-be3fa22aa364)).

**Environmental storytelling framing.** The bootcamp material divides it three
ways: **macro** storytelling (subtle context supporting the larger game story),
**micro** storytelling (small vignettes within a space, left to interpretation)
and **player** storytelling (a playground in which players make their own),
which matches Jim Brown's GDC session "Once Upon a Time: Giving Players the
Freedom to Create Their Own Story", presented immediately before the Skyrim kit
talk in the same bootcamp
([GDC Vault, Talking to the Player](https://www.gdcvault.com/play/1017638/AAA-Level-Design-in-a);
[GDC Vault, Techniques for In-Level Storytelling](https://gdcvault.com/play/1017639/AAA-Level-Design-in-a)).

---

## 4. Wayfinding and legibility

Lynch's *The Image of the City* (1960) derives from a five-year study of
Boston, Jersey City and Los Angeles, and names five elements: **paths** (the
channels of movement, the dominant element because movement defines
perception), **edges** (linear elements *not* used as paths — a shore, a rail
line, a major avenue), **districts** (large sections of distinct character),
**nodes** (points where decisions are made — crossroads, squares, a district
centre) and **landmarks** (external reference points one orients by from a
distance without entering)
([ArchitectureCourses](https://www.architecturecourses.org/design/kevin-lynchs-5-elements-city-guide-urban-design);
[Urbequity summary](https://urbequity.com/en/kevin-lynch-the-image-of-the-city/)).
**Legibility** is how readily the environment is understood and mentally
organised; **imageability** is the quality in an object that makes a strong,
well-structured mental image likely
([Urbequity](https://urbequity.com/en/kevin-lynch-the-image-of-the-city/)).
Lynch's own qualification is important: the five elements are only the raw
material, and must be refined into complexes whose harmony creates the unified
image ([Urbequity](https://urbequity.com/en/kevin-lynch-the-image-of-the-city/)).

The salience literature makes landmark quality computable. Sorrows and Hirtle
(1999), "The nature of landmarks for real and electronic spaces", COSIT, LNCS
1661, pp. 37–50, identify three landmark types — **visual** (physically
prominent in shape, colour, size), **cognitive/semantic** (prominent in
meaning) and **structural** (prominent by position) — and stress the categories
are not discrete, with the best landmarks prominent in all three
([Landmarks in wayfinding: a review, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8324579/)).
Raubal and Winter (2002) formalised measures at decision points, operationalised
as façade area (width × height), colour checked against surroundings, shape as
height-to-width proportion, and visibility as the 2D area covered by the
visibility cone of the landmark's front, with semantic salience drawn from a
historic/cultural database
([PMC review](https://pmc.ncbi.nlm.nih.gov/articles/PMC8324579/)).
Their key claim: **being a landmark is not innate to a feature — any feature
serves if it is prominent or distinct enough in context**
([PMC review](https://pmc.ncbi.nlm.nih.gov/articles/PMC8324579/)).
Extensions: Nothegger et al. (2004) computed salience for nine intersections
along a route from ortho-imagery; Burnett (2000) treats visibility as the key
indicator; Winter (2003) adds advance visibility; Appleyard (1969) anticipated
the triad with form, visibility and social attributes; Caduff and Timpf (2008)
shift to a trilateral landmark–environment–observer relation, and Nuhn and
Timpf add personal and subjective dimensions
([PMC review](https://pmc.ncbi.nlm.nih.gov/articles/PMC8324579/)).
An empirical wrinkle: with 63 participants at 30 Quebec City intersections,
locals selected highly semantic landmarks where strangers did not, and women
were more influenced by structural salience than men
([PMC review](https://pmc.ncbi.nlm.nih.gov/articles/PMC8324579/)).
Visual salience has also been modelled directly for **3D virtual urban
environments** rather than real cities
([Elsevier, visual salience model for wayfinding in 3D virtual urban environments](https://www.sciencedirect.com/science/article/abs/pii/S0143622816303587)).

How games test legibility. Telemetry heatmaps aggregate coordinates across
sessions to show whether players explore as intended, ignore critical paths,
get lost in complex geometry or find unintended shortcuts, bridging designed
and actual play
([Using Telemetry Heatmaps](https://salivity.github.io/game-development/article/using-telemetry-heatmaps-to-analyze-player-behavior)).
The recorded limitation is sharp: plain heatmaps discard direction and time,
and *being lost is a temporal phenomenon* — backtracking, dwell, re-traversal —
so spatio-temporal clustering with behaviour-based partitioning is proposed
instead ([Beyond Heatmaps](https://www.researchgate.net/publication/262789848_Beyond_Heatmaps_Spatio-Temporal_Clustering_using_Behavior-Based_Partitioning_of_Game_Levels)).
Ubisoft's DNA tracking on *Assassin's Creed* is the standard open-world
precedent, viewing collected data as map overlay or table
([Game Developer](https://www.gamedeveloper.com/design/game-telemetry-with-dna-tracking-on-assassin-s-creed)).
Qualitatively, Player Research on Remedy's *Control* deliberately withheld
assistance from lost testers — "when players spend way too long in an area,
that's something we need to know" — moving them on only once the reason was
understood ([Player Research](https://playerresearch.medium.com/the-last-days-of-control-cf2ae4c4f0eb)).
The Level Design Book notes much of this needs no tooling at all, only
attentive note-taking
([Level Design Book, playtesting](https://book.leveldesignbook.com/process/blockout/playtesting)).

---

## 5. Modding conventions (Creation Kit)

**Navmesh.** Navmesh may be hand-built or auto-generated; a Recast-style
generation is acceptable for testing, but automated generation never produces
the clean coherent result a level needs, so generate-then-clean is the fast
path, cleaned up as clutter is added
([CK Wiki, Category:Navmesh](https://ck.uesp.net/wiki/Category:Navmesh)).
Two specific gotchas: selecting an edge with Draw Cover enabled is very likely
to crash the editor, and **in deep water the navmesh must sit on the ground
surface underwater, not on the water plane**
([CK Wiki](https://ck.uesp.net/wiki/Category:Navmesh)).
Placing buildings in an existing exterior requires **cutting** navmesh, not
deleting it; deleted navmesh is a leading settlement-building error that breaks
mod compatibility and can crash the game — Darkfox127's tutorial exists
specifically for this
([Darkfox127, Navmesh Cutting](https://www.darkfox127.co.uk/single-post/navmeshcutting)).
Reusable building pieces should carry box, sphere or plane navmesh-cutting
primitives attached to the base object, which are greyed out unless the base
object itself is being navmeshed
([CK Navmesh Cheat Sheet](https://github.com/ciathyza/modding-guides/blob/master/Cheat%20Sheets/Creation%20Kit%20Navmesh%20Cheat%20Sheet.md)).
Integrity problems surface as pathfinding warnings in `editorwarnings.txt`,
which is cleared each time the editor opens — typical entries are linked
triangles with opposite normals, or edges that should be linked and are not,
where a flipped normal faces the ground rather than away
([gamesas thread](https://gamesas.com/navmesh-bug-part-iii-t258581-100.html)).

**Roads and floating objects.** The landscape tool handles path roads on
straight flat stretches and becomes awkward on rugged terrain; the standard fix
for objects floating or sinking is to raise land then flatten with a large
radius, levelling a cell or two before editing
([TES Alliance, Making Path Roads](http://tesalliance.org/forums/index.php?%2Ftopic%2F8234-creation-kit-making-path-roads%2F=);
[Tamriel Rebuilt, Exterior Modding Guide](https://www.tamriel-rebuilt.org/content/tutorial-exterior-modding-guide)).
Vertex shading is applied through the "edit colours" checkbox in the vertex
colour section, left-click to add and right-click to erase
([Tamriel Rebuilt](https://www.tamriel-rebuilt.org/content/tutorial-exterior-modding-guide)).

**Region generation.** Region generation automates landscaping and mass object
placement and saves enormous time against hand painting, but has many
parameters and a steep learning curve; because textures apply across a whole
cell, **no more than five or six landscape textures** should be used, and
border cells often show black texture artefacts needing manual fixing. A known
quirk is that the editor does not always register changed texture or object
values — deselect and reselect the entry to confirm
([Hoddminir, Region generation part I](http://hoddminir.blogspot.com/2021/02/region-generation-part-i-landscape.html)).

**LOD.** Worldspace LOD comprises four file kinds — meshes (.btr), textures
(.dds), normals (.dds) and a .lod file; painting with non-default textures
requires extra steps for the LOD generator, duplicating each TextureSet and
repointing each LandTexture. Missing landscape LOD means broken meshes (clear
and regenerate); LOD darker than the loaded cell points at bad normal maps.
Tree LOD that fails to disappear on approach is a known case-by-case issue with
no established cause. Static object LOD for custom meshes is poorly documented
and is normally handled by xLODGen/DynDOLOD rather than the editor
([Hoddminir, Generating LODs](http://hoddminir.blogspot.com/2012/02/generating-lods-in-creation-kit.html);
[Nexus forums, LOD for objects](https://forums.nexusmods.com/topic/5292160-how-can-i-generate-lod-for-objects-in-my-mod/)).

The recurring modder failure list across these sources is therefore: deleted
rather than cut navmesh; navmesh islands and flipped normals; floating or sunk
objects on unflattened terrain; co-planar geometry z-fighting (which the
Bethesda kit talk also names for stacked floors and ceilings); too many
landscape textures per cell; and missing or mismatched LOD.

---

## 6. Ecology and climate constraints on wetland settlement (brief)

Terps — also wierden, warften, wurten — are artificial dwelling mounds on the
North European plain raised to keep settlement above storm surge and river
flood ([Wikipedia, Terp](https://en.wikipedia.org/wiki/Terp)). The trigger was
relative sea-level rise of 5–10 cm per century during the Dunkirk I
transgression, which pushed inhabitants to raise dwellings above the high-water
mark rather than build on stilts; mounds were heightened as needed and extended
after the Roman period for cropping as the old marsh surface wetted
([Vereniging voor Terpenonderzoek](https://terpenonderzoek.nl/education/?lang=en);
[PSU Earth 107](https://courses.ems.psu.edu/earth107/node/1082)).
Scale: some 1,200 terpen are recorded in Groningen and Friesland alone, from
single farmsteads to villages and old towns, with surveyed heights from a
slight rise to about 8 m above the marsh at Hoogebeintum and cited maxima of
15 m ([Wikipedia](https://en.wikipedia.org/wiki/Terp);
[Kent Archaeology, The Terpen of North Friesland](https://www.kentarchaeology.org.uk/magazine/28/02-the-terpen-mounds-of-the-north-friesland-marshes-in-holland)).
Building periods cluster: from 500 BC, then 200–50 BC, with the clay district
deserted after mid-third-century sea-level rise until about AD 400, and a third
period from about AD 700 ending with the dike around 1200
([Wikipedia](https://en.wikipedia.org/wiki/Terp)).
Feddersen Wierde (excavated 1955–63) is the type site: ~70 timber longhouses
with integrated byres, about 26 households at its fourth-century peak, keeping
people and stock above water during floods, with anaerobic marsh soils
preserving wood and bone ([Wikipedia](https://en.wikipedia.org/wiki/Terp)).
Two further points: flooding is also a *benefit*, depositing fine sediment that
improves floodplain agriculture, so dwellings and churches are sited against
flood risk while fields are allowed to inundate
([PSU Earth 107](https://courses.ems.psu.edu/earth107/node/1082)); and drowned
landscapes are real and readable, with the Edomsharde region largely destroyed
in 1362 and settlement remains, including the recently located church of
Rungholt, surviving in the tidal flats
([Nature, Scientific Reports, Rungholt](https://www.nature.com/articles/s41598-024-66245-0)).

---

## 7. Candidate principles the sources support

**Candidates only — for the synthesis agent to accept, reject or reshape. Not
rules.** Source tags: `[site]` settlement geography, `[conz]` Conzen/burgage,
`[mkt]` market town, `[vern]` vernacular water settlement, `[proc]` procedural
generation, `[syn]` space syntax, `[apl]` A Pattern Language, `[beth]`
Bethesda, `[game]` other studios, `[way]` wayfinding research, `[ck]` Creation
Kit convention, `[wet]` wetland archaeology.

1. Every settlement records a *site* reason and a separate *situation* reason;
   size follows situation, not site. `[site]`
2. Prefer sites where two or three site reasons coincide — a dry point at a
   confluence that is also the lowest crossing. `[site]`
3. Lowest bridging point on a navigable river is the port site; place at most
   one per river. `[site]`
4. Confluences are nodal and take route-junction settlements. `[site]`
5. In a marsh, the dry point is the settlement and everything else is field,
   fishery or grave. `[site][wet]`
6. Incised meanders and spurs take defensive sites; water on three sides is the
   canonical form. `[site]`
7. Gaps between higher ground take toll and control settlements. `[site]`
8. Read a settlement as plan units, each recording one growth phase, and keep
   the seams between them visible. `[conz]`
9. Plot series along a frontage, long and narrow, front strip trading, rear
   yard: the smallest reusable unit of built settlement. `[conz][mkt]`
10. Plot dimensions are prescribed and metric — pick a plot module and hold it,
    so the pattern reads. `[conz]`
11. Subdivision over time should not erase earlier boundaries. `[conz]`
12. Backland infill (the burgage cycle) is how a place shows age without new
    art. `[conz]`
13. A fringe belt of large low-density plots marks where growth once paused.
    `[conz]`
14. The market is a shape, not a plaza: long widened street, triangle at a
    three-road meeting, or rectangle at a T-junction. `[mkt]`
15. Widening the through-road *is* a legitimate town plan; a grid is not
    required for a planted town. `[mkt]`
16. Street hierarchy: high street, cross street, back lane, alley — four tiers,
    no more. `[mkt]`
17. The settlement focus may migrate from the church to the road junction; both
    can coexist as competing centres. `[mkt]`
18. Encroachment (buildings in the old market space) and named specialised
    market areas are cheap, high-yield age signals. `[mkt]`
19. On a floodplain, houses string along the natural levee, the highest ground
    at the channel edge. `[vern]`
20. Where flooding overtops even the levee, settlement moves to the adjacent
    bluff top and works the floodplain seasonally. `[vern]`
21. Stilt villages are deliberately non-gridded, so downwind houses still get
    air. `[vern]`
22. House long axis is set by one dominant cultural or climatic rule, applied
    consistently across a culture. `[vern]`
23. The stair marks the land front; frontage direction is readable from
    geometry. `[vern]`
24. Hot-humid building kit: raised floor over ventilated undercroft, deep eaves,
    steep roof, porous walls, shaded verandah. `[vern]`
25. The parish-cell module: church, campo before it, well, one canal side,
    houses outward, all streets leading back to the campo. `[vern]`
26. Water-town street types are named by their relation to water and their
    width, not arbitrarily. `[vern]`
27. Two contrasting water-town grammars are available — irregular parish
    accretion versus regulated plot extension — and mixing them within one
    settlement reads as incoherence. `[vern]`
28. Pre-industrial waterfronts co-locate dwelling, office and warehouse in one
    building. `[vern]`
29. Grow roads by global goal plus local constraint: propose toward density,
    then adjust or reject against terrain and existing geometry. `[proc]`
30. Drive generation from image maps — water mask, elevation, density — rather
    than from hand-listed coordinates. `[proc]`
31. Typed wards, then neighbourhood grouping of like adjacent wards, then alley
    and lot fill inside each ward. `[proc]`
32. Label a cluster once at its centre rather than labelling each member.
    `[proc]`
33. Expose feature presence (wall, castle, gate count, river) as authored
    control rather than emergent output. `[proc]`
34. Offset polygons properly, or streets will pinch. `[proc]`
35. Farmhouses sit at field edges, not field centres. `[proc]`
36. A settlement's integration core — its few longest sight-and-movement lines
    — should coincide with where activity is intended. `[syn]`
37. Legibility is measurable as the correlation between what is locally visible
    and where a space sits in the whole. `[syn]`
38. Configuration drives movement before attractors do; put the market on the
    integrated line rather than expecting the market to make the line busy.
    `[syn]`
39. Analyse with a buffer of surrounding layout, since edge effects distort
    integration. `[syn]`
40. Build where the site is worst and leave the best ground alone (104). `[apl]`
41. Buildings sit on the shaded side of their outdoor space (105). `[apl]`
42. No leftover space: every outdoor space is partly enclosed and positive
    (106), and opens onto a larger one (114). `[apl]`
43. Gateways mark the threshold into a settlement (53); entrances are a
    transition, not a door (112); main entrances are visible on approach (110).
    `[apl]`
44. Paths need a visible goal at the end (120), and path shape should be a
    place rather than a corridor (121). `[apl]`
45. Buildings front the public space rather than turning their backs on it
    (122). `[apl]`
46. Small public squares should be small enough to feel alive (61), sited on
    activity nodes (30). `[apl]`
47. Size every metric against character height (128 units / six feet) and keep
    minimum passages at two character widths. `[beth]`
48. Walkable slope 30–45 degrees for looks, 60 as the AI ceiling. `[beth]`
49. Spend art on the standard pieces used thousands of times; add hero pieces
    late. `[beth]`
50. Players notice repeated *detail* long before repeated architecture — vary
    clutter, not silhouette. `[beth]`
51. Divorce architectural identity from inhabitant type so kits recombine.
    `[beth]`
52. Keep everything inside the footprint; predetermine floor thickness when
    stacking. `[beth]`
53. Off-grid rotation and freely placed shell elements are how a kit stops
    reading as a kit. `[beth]`
54. A city's districts should encode social structure, and its fortification
    style should encode its culture's era. `[beth]`
55. A high proportion of enterable buildings should hold something — Whiterun
    runs 16 of 21. `[beth]`
56. Triangular masses give a peak to aim for and a back side to discover;
    obstacle sizes must vary so large masses beckon and mid-sized ones occlude.
    `[game]`
57. A designed horizon can replace navigation aids. `[game]`
58. Soft, cheap directional aids (a wind vector, a dust trail) beat markers, and
    need not be physically accurate. `[game]`
59. Give directional aid only toward things worth reaching, and let soft gating
    turn the player aside into the world. `[game]`
60. Inside a big built place, navigate by a sequence of masses, with enemy
    placement confirming the route. `[game]`
61. Two classes of location: narrated and silent; both are legitimate. `[game]`
62. Town character can carry theme — welcome, unwelcome, cramped, open — and
    change how the player behaves. `[game]`
63. Distinguish macro, micro and player environmental storytelling and place
    each deliberately. `[game]`
64. Landmarks are visual, semantic and structural; the best score on all three.
    `[way]`
65. Landmark status is contextual, never innate — a modest thing in an empty
    place outranks a grand thing among grand things. `[way]`
66. Salience is computable from façade area, colour contrast against
    surroundings, height-to-width proportion and visibility-cone area. `[way]`
67. Place a salient landmark at every decision point, not uniformly. `[way]`
68. Locals and strangers read different landmarks; a returning player and a
    first-time player will not use the same cues. `[way]`
69. Test lostness temporally — backtracking, dwell time, re-traversal — since a
    plain position heatmap cannot show it. `[way]`
70. Do not rescue a lost tester until the reason is understood. `[way]`
71. Cut navmesh, never delete it, and keep it on the ground beneath water.
    `[ck]`
72. Attach cutting primitives to reusable building pieces rather than editing
    mesh per placement. `[ck]`
73. Auto-generate then hand-clean navmesh as clutter lands; never ship raw
    auto-generation. `[ck]`
74. Layout must not depend on long-range NPC travel, which degrades; use
    intermediate waypoints. `[ck]`
75. Flatten before placing on rugged ground, or accept floating and sunk
    objects. `[ck]`
76. Cap landscape textures per cell at five or six. `[ck]`
77. Treat LOD, including tree and object LOD, as a shipping requirement, not a
    polish item. `[ck]`
78. Raise dwellings above the recorded flood line; let fields flood, because
    flooding is what makes them fertile. `[wet]`
79. Mounds are heightened and extended over time — a mound village's profile is
    a chronology. `[wet]`
80. Abandonment and drowning are legitimate settlement states, and their
    remains stay readable in the flats. `[wet]`

---

## 8. Where the sources disagree

- **Floodplain versus bluff.** Ribeirinho practice puts houses on the levee;
  Denevan's bluff model argues most prehistoric settlement avoided the
  floodplain entirely. Both are cited above and they imply different siting
  rules. `[vern]`
- **Mound versus stilt.** The Frisian answer to flooding was mass earth-raising
  and explicitly *not* stilt houses; SE Asian and Amazonian practice is stilts.
  The choice appears to follow available material and flood behaviour rather
  than a universal optimum. `[wet][vern]`
- **Space syntax reliability.** Hillier and Iida's own result — correlations
  moving −13% to +54% purely by changing representation — undercuts naive use
  of intelligibility as a target metric. `[syn]`
- **Procedural fidelity.** Watabou states plainly that his method is arbitrary
  and aims at a pleasing map; Parish & Müller aim at plausible structure from
  real inputs. Their outputs look similar and their claims are not
  interchangeable. `[proc]`
- **Vernacular orientation.** Climate-responsive orientation is the stated
  principle, but measured performance was poor where religious and site
  constraints overrode it — culture beat climate in practice. `[vern]`
- **Souls-like analysis quality.** A practising level designer holds that the
  popular analysis of interconnected world-building is superficial, which is a
  caution against taking shortcut-and-loop descriptions as a method. `[game]`
