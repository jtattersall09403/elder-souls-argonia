# Kit-based level design and layout generation — the known craft

> Research for Phase 10 (asset kits), Phase 11 (settlement compiler) and
> Phase 12 (dungeon grammars). **Inspiration, not prescription** — take what
> fits our constraints (sourced Skyrim/mod kits, no new art, deterministic
> compilers driven by agent-authored blueprints). Repo context this serves:
> dungeon families / `InteriorProgram` / `CombatSpaceBlueprint`
> ([world/70](../world/70-dungeons-interiors.md)); causal models →
> `SettlementBlueprint` → deterministic compiler ([world/40](../world/40-causal-authoring.md));
> scatter as a separate detail layer ([world/65](../world/65-vegetation-scatter.md));
> sourcing rule ([world/90](../world/90-asset-strategy.md) §71).
>
> Provenance tags: **[doc]** documented practice (talk/paper/official wiki),
> **[lore]** community/modding lore, **[inf]** my inference for our context.

## 1. Bethesda's modular kit methodology

Canonical source: Joel Burgess & Nathan Purkeypile, *Skyrim's Modular Approach
to Level Design* (GDC 2013 "Level Design in a Day"), transcript on
[Burgess's blog](http://blog.joelburgess.com/2013/04/skyrims-modular-level-design-gdc-2013.html)
and republished on [Game Developer](https://www.gamedeveloper.com/design/skyrim-s-modular-approach-to-level-design).
Follow-ups: *The Modular Level Design of Fallout 4* (GDC 2016) and an
[80.lv interview on modularity/kits/art fatigue](https://80.lv/articles/building-huge-open-worlds-modularity-kits-art-fatigue);
condensed craft summary in [The Level Design Book](https://book.leveldesignbook.com/process/blockout/metrics/modular).

### 1.1 Kit anatomy [doc — GDC 2013]
- "Kits, first and foremost, are systems… far more than the sum of their parts."
  A kit = sub-kits (e.g. small hallway, large hall, room) of pieces: straights,
  2/3/4-way junctions, corners, rooms (small/large), standardized doorways,
  caps/end pieces, plus specials: *glue kits* (small transition pieces —
  platforms, tunnels, ledges — built for cross-kit bashing), *platform kits*
  (overlay on any surface), *shell kits* for caves (grid shell + freely placed
  walls/pillars inside), and *de-twist* pieces where asymmetric (A/B-sided)
  hallways meet flipped copies.
- **Footprints are the foundation.** Typical: rooms 512×512×512 units,
  hallways 256×256×256. Sub-kit footprints need not match but "should be
  multiples of each other" — a 384 room against a 256 hallway "will eventually
  create gaps and/or overlaps" when a layout loops back.
- Geometry lives *inside* the footprint; it only touches the footprint edge at
  snap faces. Walls co-planar with the footprint edge are a named failure
  (adjacent hallways leave "no room for the walls themselves to exist").
- Don't tile on all axes: hallways tile on one axis, rooms on two; vertical
  circulation goes in dedicated shaft/stair sub-kits.
- Floors/ceilings need explicit thickness (stacking two floors of zero-thick
  kit = z-fighting and seam leaks).
- Pivots at ground plane, centred (exceptions documented per sub-kit).
- Scale: Skyrim shipped 7 architectural kits; 8 level designers + 2 kit
  artists built 400+ interior cells in ~2.5 years. Cave kit used 200+ times
  (~50 pieces in its small-hallway sub-kit alone); Ratway kit used twice
  (~7 pieces per sub-kit) — kit investment scaled to expected reuse.

### 1.2 Snap facts for vanilla Skyrim kits (what our compilers must honour)
- **1 unit = 1.42875 cm; ~70.0028 units/m; 128 units = 6 ft = 1.8288 m ≈
  humanoid height at scale 1.0; an exterior cell is 4096×4096 units (~58.5 m
  square).** [doc/lore — [Creation Kit wiki "Unit" table](https://ck.uesp.net/w/index.php?title=Unit),
  corroborated by [Nexus "Know Your Units"](https://www.nexusmods.com/skyrimspecialedition/mods/86887)
  and the community derivation FT = units × 0.046875
  ([ESO forums](https://forums.elderscrollsonline.com/en/discussion/538623/character-body-height-in-real-life-measurements))]
- Creation Kit practice: **snap-to-grid 128, snap-to-angle 45°** for the
  Nordic ruin kit; snapping is mandatory — "eyeballing kit pieces will always
  leave gaps and seams." [doc — [Bethesda Tutorial Layout Part 1, CK wiki](https://ck.uesp.net/w/index.php?title=Bethesda_Tutorial_Layout_Part_1)]
- Designers typically work at *half the footprint* as the default snap
  setting [doc — GDC 2013]. Piece dimensions stick to powers of two (128/256/512),
  often encoded in the NIF filenames [lore — modding forums; verify per kit at
  ingest]. *Snap to Reference* lets a rotated piece become a new grid origin —
  organic layouts without abandoning snapping [doc — GDC 2013].
- Movement metrics tied to the grid: min traversable gap ≈ two character
  widths; AI handles inclines to 60° but 30–45° reads better [doc — GDC 2013].
- **[inf]** Because our kits are *sourced*, kit ingestion (Phase 10) should
  measure and record each piece's actual footprint, snap faces, doorway
  socket dimensions and A/B-sidedness into a machine-readable kit manifest —
  the compiler's snapping rules are then data, not code assumptions. Budget
  for discovering that mod kits (Xanmeer tileset etc.) are less disciplined
  than Bethesda's own; a per-kit "gym scene" (below) is the cheap way to find out.

### 1.3 Workflow, kit gyms, hiding repetition [doc — GDC 2013 unless noted]
- Kit artist + level designer paired from concept to polish; phases: concept →
  proof (1–3 wks, untextured, prove "kit logic") → graybox (design builds real
  levels with ugly pieces while art does visuals) → build-out → polish (resist
  bloat). Naming conventions agreed at graybox (e.g. FO3 `UtlBayCorInMidPRTT01L01`
  = kit/sub-kit/type/direction/function/variant/mirror).
- The designer **stress-tests continuously**: loop the kit back on itself
  (footprint errors), stack vertically (co-planar seams), abuse pieces in
  unintended combos (pillared rooms from hallway pieces). The dedicated test
  level assembling every piece in every configuration is the "kit gym"
  [lore — the term is community shorthand for the practice Burgess describes;
  The Level Design Book's version: loopback/stack/gap tests before variants].
- Hiding repetition: players punish repeated *detail* faster than repeated
  *architecture* — so keep big forms modular and vary the dressing. Tools:
  01/02/03 texture-variant pieces on identical footprints ("cheap" — no new
  geometry validation), clutter/lighting/AO to mask intersections, sparse
  unique "hero" pieces only after the core kit is stable, and **kit-bashing**
  (Dwarven hallway + ice-cave shell = "instant shift in tone" with zero new art).
  Also: divorce kit aesthetic from gameplay context (don't lock one enemy type
  to one kit) — repetition reads faster when meaning is repeated too.
- Named pitfalls: footprint non-multiples; co-planar walls/floors; "patch-up"
  pieces that treat symptoms (fix the core piece instead); kit bloat from
  saying yes to every request; hero-piece distraction; all-axis tiling; and
  grid tyranny — countered by deliberate escape hatches (snap-to-reference,
  shell kits, pivot-and-flange hallways rotating at arbitrary angles with
  archways covering the gaps). "When you start to bend the rules, always keep
  in mind the reason they were rules in the first place."
- **[inf]** For us the "designer" is a blueprint-authoring agent and the
  "artist" is the sourced kit + our converters — but the loop transfers: gym
  scene first, blueprint against graybox-level assembly early, cosmetic passes
  (variants, clutter, lighting) late and data-driven. The scatter layer
  ([65](../world/65-vegetation-scatter.md)) is our built-in repetition-hider.

## 2. Dungeon design craft (for Phase 12 grammars)

### 2.1 The Bethesda pattern [lore — widely documented player/critic analyses]
- The signature Skyrim shape: broadly linear path → arena rooms → boss +
  guaranteed chest → **shortcut back to the entrance** (barred door, rockfall,
  drop). Players read the barred door near the entrance as a promise. Analyses:
  [Zac Thompson, "Bethesda's Gameplay Loops"](https://medium.com/@zacnicthompson/game-insight-bethesdas-gameplay-loops-dungeons-dragons-and-junk-712588ff6bdc);
  contested enough that the [Inconvenient Dungeons mod](https://www.nexusmods.com/skyrimspecialedition/mods/66784)
  exists to delete the shortcut. The pattern optimises for no-backtracking
  15–30 minute sessions and works because most Skyrim dungeons hold a unique
  item/story at the end (the Oblivion lesson). Its cost: predictability.
- Craft heuristics that recur in Bethesda-adjacent writing [lore/doc — Dan
  Taylor's *Ten Principles for Good Level Design*, GDC 2013 ([talk](https://www.youtube.com/watch?v=iNEe3KhMvXM),
  [Part 1](https://www.gamedeveloper.com/design/ten-principles-of-good-level-design-part-1-)/[Part 2](https://www.gamedeveloper.com/design/ten-principles-of-good-level-design-part-2-)),
  who cites Bethesda's own "learn, play, challenge, surprise" loop]: guide with
  visual language not words; entrance vista that frames the goal; teach → test
  → surprise; vary pacing away from uniform "rollercoaster" beats.
- **[inf]** Our dungeon families ([70 §47](../world/70-dungeons-interiors.md))
  should encode the *rhythm* (entrance-vista → escalation → payoff →
  shortcut-back) per family, but Argonia's water gives better shortcut
  vocabulary than a barred door: siphons, drains, vertical flooded shafts,
  boat escapes — the §47 table already lists these.

### 2.2 Souls-side craft (our combat is Souls-like)
- Dark Souls 1 analyses converge on: **shortcuts are the reward economy** in a
  world without early fast travel — unlocking a ladder/elevator *is* loot;
  loops counterbalance death-repetition and produce "aha" recognition
  ("a path that could be reached in a straight line is forcibly made into a
  circle") — [Bramasole, "Methodology of creating Souls-like Level"](https://medium.com/@bramasolejm030206/preface-ec08bc1459d0);
  verticality carries legibility (see the goal below/above you before you
  reach it) — [PCGamesN on Undead Burg](https://www.pcgamesn.com/dark-souls-remastered/undead-burg-level-design-verticality);
  interconnection is the world-scale version of the loop —
  [TheGamer](https://www.thegamer.com/dark-souls-1-fromsoftwares-magnum-opus-of-interconnected-level-design/),
  [Roha, "World Design lessons from FromSoftware"](https://medium.com/@Jamesroha/world-design-lessons-from-fromsoftware-78cadc8982df);
  academic case study: [Ribbing & Melander thesis](https://www.diva-portal.org/smash/get/diva2:935733/FULLTEXT01.pdf).
  Even fans note DS1's second half abandons interconnection once warping
  unlocks — the structure matters most while traversal is expensive [lore].
- **[inf]** Fusion rule for us: Bethesda's shortcut-back is the *degenerate*
  single-cycle case of the Souls loop. Grammars should treat shortcut edges as
  first-class rewards (opened from the far side), and combat arenas along them
  must satisfy `CombatSpaceBlueprint` clearances ([70 §49](../world/70-dungeons-interiors.md))
  — roll/sweep/camera clearance is what makes Souls combat readable in tight kits.

## 3. Settlement and village layout generation — the known families

Survey anchor: [Kelly & McCabe, "A Survey of Procedural Techniques for City
Generation" (2006)](https://arrow.tudublin.ie/itbj/vol7/iss2/5/). [doc]

- **Growth/L-system roads**: [Parish & Müller, *Procedural Modeling of Cities*,
  SIGGRAPH 2001](https://cgl.ethz.ch/Downloads/Publications/Papers/2001/p_Par01.pdf) —
  roads grown from population/terrain maps under global goals + local
  constraints; the origin of CityEngine. Later implementers found the L-system
  machinery "unnecessarily complex" and reimplemented it as plain iterative
  growth ([e.g.](https://github.com/Yatoom/city-generator)) [doc/lore].
- **Tensor-field roads**: [Chen/Esch/Wonka/Müller/Zhang, *Interactive
  Procedural Street Modeling*, SIGGRAPH 2008](https://peterwonka.net/Publications/pdfs/2007.SG.Esch.InteractiveProceduralStreetModeling.Sketch.pdf) —
  a user-editable tensor field guides street tracing; the important idea for
  us is **authored control fields driving deterministic tracing** (already the
  precedent cited in [40 §30](../world/40-causal-authoring.md)).
- **Shape grammars for parcels/buildings**: CGA (Müller et al. 2006 →
  [Esri CityEngine](https://doc.arcgis.com/en/cityengine/latest/tutorials/tutorial-6-basic-shape-grammar.htm)):
  split mass model → facades → floors → tiles by rules with parameters and
  seeded randomness. Parcel subdivision has two standard algorithms — recursive
  **OBB split** and **straight-skeleton** inset — from
  [Vanegas et al., *Procedural Generation of Parcels in Urban Modeling*, EG 2012](https://twak.org/project/parcels/),
  both robust against irregular block shapes. [doc]
- **Pragmatic indie tier**:
  - [Watabou's Medieval Fantasy City Generator](https://watabou.itch.io/medieval-fantasy-city-generator)
    is **block-centric, not road-centric**: Voronoi "patches" become semantically
    typed wards (gate/craftsmen/market…), later grouped into districts "grown"
    around landmarks; lots by bisection/Voronoi/"twisted" split. He is explicit
    the method "is rather arbitrary — the goal is a nice looking map, not an
    accurate model" ([devlogs](https://watabou.itch.io/medieval-fantasy-city-generator/devlog),
    [districts](https://watabou.itch.io/medieval-fantasy-city-generator/devlog/85275/070-districts)). [doc]
  - Townscaper (Oskar Stålberg): tiles on a relaxed **irregular quad grid** +
    marching-squares-style corner labelling — organic shapes from a snapping
    system ([IndieCade 2019 talk](https://www.youtube.com/watch?v=1hqt8JkYRdI),
    [AI and Games writeup](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making)). [doc]
  - **WFC**: powerful for local texture, but "WFC doesn't have any global
    structure… it rarely generates large scale structures, which can give
    large levels a homogenous, unplanned look" — the maintainer of the main
    WFC libraries ([Boris the Brave, tips & tricks](https://www.boristhebrave.com/2020/02/08/wave-function-collapse-tips-and-tricks/),
    [explained](https://www.boristhebrave.com/2020/04/13/wave-function-collapse-explained/)).
    Use it (if at all) as a *filler* inside semantically-decided regions, never
    as the planner. [doc]
- **Village scale specifically**: the standard shipped pattern is **paths
  first, then plots, then buildings** — [Emilien et al., *Procedural
  Generation of Villages on Arbitrary Terrains* (2012)](https://perso.liris.cnrs.fr/eric.galin/Articles/2012-villages.pdf)
  interleaves settlement-seed placement (interest maps: water, slope, sociability)
  with anisotropic-shortest-path roads under slope/curvature limits;
  [SBGames 2018](https://www.sbgames.org/sbgames2018/files/papers/ComputacaoFull/188241.pdf)
  does the same with A* + custom costs; indie devlogs converge on
  centre-out density falloff and anchor-then-infill
  ([Forsaken: Year One devlog](https://www.moddb.com/games/forsaken-year-one/news/devlog-procedural-village-generation-part-2-road-placement)). [doc]
- **The critique**: pure PCG settlements read as soulless/unplanned (see WFC
  homogeneity above; opinion pieces like
  [Unmapped Worlds](https://unmappedworlds.com/posts/what-makes-a-procedural-world-have-a-soul/)).
  The shipped-game answer is **"grammar proposes, author disposes"** —
  generators as drafting tools under authored high-level intent (Watabou's
  authored ward semantics; CityEngine's user-edited fields; our
  agent-authored `SettlementBlueprint` over a deterministic compiler is
  exactly this pattern) [inf, built on the above docs].
- **[inf]** Mapping to Phase 11: the causal model decides *why* (anchors:
  Hist tree, dock, spring, gate — cf. [40 §29.3](../world/40-causal-authoring.md));
  paths-first tracing under slope/flood constraints gives routes/boardwalks;
  OBB/skeleton subdivision gives parcels along them; kit-conforming building
  placement fills parcels; jitter only below the semantic level. Flood-cycle
  compliance (the §28 binding) belongs in the path/parcel cost functions, not
  in a post-fix pass.

## 4. Dungeon layout generation

- **Mission/space grammars** [doc]: Dormans & Bakkes, *Generating Missions and
  Spaces for Adaptable Play Experiences* (IEEE TCIAIG 3(3), 2011): generate the
  **mission** (a graph of gameplay beats: locks, keys, valves, tests) with a
  graph grammar first, then map it onto **space** with a second (shape/tile)
  grammar. Accessible modern treatment: [Boris the Brave, "Graph Rewriting for
  Procedural Level Generation"](https://www.boristhebrave.com/2021/04/02/graph-rewriting/).
- **Cyclic generation** [doc]: Dormans' *Unexplored* — start from a **cycle**,
  not a start→goal path: entrance and goal split a loop into two arcs, and a
  vocabulary of cycle types (lock-and-key, hidden shortcut, double-lock,
  dangerous-route-vs-long-route) nest recursively. "Cycles beat trees" —
  branches are dead ends; cycles are pacing. Deep dives:
  [Boris the Brave, "Dungeon Generation in Unexplored"](https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/),
  [AI and Games on Game Developer](https://www.gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-),
  [Ludomotion's own Unexplored 2 blog](https://www.ludomotion.com/blogs/level-generation/index.html).
  Sobering scale note: Unexplored's pipeline is ~5000 find-replace rules in a
  custom tool (Ludoscope/PhantomGrammar) — grammar systems grow big; budget
  for tooling and visualisation, not just rules. [doc]
- **Constraint-based room placement** [doc/lore]: place rooms under
  non-overlap/adjacency constraints, connect, validate (typical roguelike
  practice; WFC/answer-set variants exist). Weaker at narrative structure than
  grammars; fine for minor variants of a family.
- **Interaction with fixed kit snapping** [inf, grounded in §1]: the grammar
  should emit an *abstract* layout graph (rooms typed by function and
  `CombatSpaceBlueprint` scale, edges typed as corridor/stair/swim/climb/
  shortcut); a separate **realisation pass** maps nodes/edges to kit sub-kit
  templates on the kit's own grid (128/256/512-unit footprints, doorway
  sockets). Two known failure points: (a) loops — cycle closure only works if
  footprints are multiples and the realiser can path-close on the grid, which
  is exactly Burgess's loopback stress test run by a machine; (b) organic
  families (root caverns, flooded caves) want shell-kit realisation
  (grid shell + free interior dressing), not corridor tiling. Realiser
  validation = automated gym: loop-closure, stacking, clearance probes.

## 5. Exemplar-first development (hand-craft one, then parameterise)

- **For** [doc]: building one excellent instance first (a) surfaces every
  metric/pipeline problem while it's cheap — Bethesda's proof→graybox kit
  phases *are* exemplar-first, stress-test levels preceding kit build-out
  (GDC 2013); and (b) calibrates cost: Xenoblade Chronicles built **one region
  to final quality** to extrapolate schedule for all regions; Rami Ismail: the
  slice is "a production prototype… the second time you make a thing it should
  go much faster" ([Levelling The Playing Field](https://ltpf.ramiismail.com/prototypes-and-vertical-slice/)).
- **Against** [doc]: Ron Gilbert: "a dumb way to build a game" — games are
  built in iterative layers, not strips; "Da Vinci didn't paint the Mona Lisa
  one strip at a time" ([Grumpy Gamer](https://grumpygamer.com/vertical_slice/)).
  Geoff Ellenor's production warning: slice-first makes tool features
  perpetual "nice-to-haves", so you can exit preproduction "with a sexy
  vertical slice made with none of the tools needed for production"
  ([Medium](https://gellenor.medium.com/dont-over-focus-on-the-vertical-slice-c304964ed747));
  also [Treadwell](https://www.ryantreadwell.com/post/not-just-a-piece-of-cake-why-vertical-slices-fall-flat-in-game-development)
  on interconnected-systems feedback going stale.
- **[inf]** Synthesis for us: the disagreement dissolves for a *generator*
  project — the exemplar is not throwaway content, it is the **first output the
  compiler must be able to reproduce**. Build one settlement and one dungeon
  per family by hand *through the blueprint format* (agent-authored, compiler-
  assembled), promote what was hand-decided into grammar rules, and keep the
  exemplar as a regression fixture. That answers Gilbert (we're iterating the
  system, the exemplar is just its first test case) and Ellenor (the exemplar
  is built *in* the tools, so tools can't lag). This is also literally the
  review loop already specified in [40 §31](../world/40-causal-authoring.md).

## 6. Open questions

1. How disciplined are the *mod* kits we'll source (Xanmeer tileset, Black
   Marsh & Valenwood) — power-of-two footprints and standard doorway sockets,
   or does Phase 10 need per-kit re-socketing/"glue" selection? Measure at ingest.
2. Stilt/boardwalk architecture has no Bethesda kit precedent at this density —
   do sourced pieces snap vertically (pile heights), and what is each piece's
   wet/dry-season delta?
3. Where is the authored/generated boundary per settlement tier? (Implicit
   proposal: major = fully agent-authored; minor = grammar proposes + agent
   review; the cut-line is undecided.)
4. Cycle vocabulary for *swim/climb* edges: Unexplored's cycle types assume
   walking; siphons/flooded shafts change traversal cost asymmetrically (air
   supply) and need their own cycle-type table.
5. Grammar tooling scale: Unexplored needed a dedicated rule IDE. What is the
   minimum inspect/visualise loop before rule count outgrows text debugging?
