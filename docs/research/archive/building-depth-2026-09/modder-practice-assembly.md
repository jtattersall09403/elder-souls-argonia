# Modder practice for assembling believable buildings from kit pieces (research, 2026-09-24)

Headline: vanilla Skyrim does not kit-bash its houses. Its farmhouses and city houses are whole-building
meshes with windows, trim, chimney and foundation baked in; the modder or designer adds the door, the
porch/walkway, lights and clutter as separate references. A bare box with a door and roof reads as
featureless because the facade detail was never in the piece. Where no whole house exists, the shared
practice is shell, then openings, then roof, then joins covered, then dressing, with a grid for architecture
and free placement for everything else.

## Reconciliation
- Covered already: docs/research/placement-settlements/kit-level-design-and-layout-generation.md §1.3
  (Burgess 2013: kit gyms, variants, kit-bashing) and settlement-design-principles-sources.md §3.1, §5
  (Burgess metrics, CK navmesh/floating/LOD failure list). Both are confirmed here, not contradicted.
- docs/research/rendering/building-placement-rendering-treatments.md §2.10/§3 covers grounding
  (skirt, foundation ring, night windows) as rendering; it does not cover what pieces make a house.
- Nothing in the repo covers PER-BUILDING assembly (the house-dressing order, the mistakes, the variety rules).
  The single live home for that is the placement-workbench skill (lane round 2,
  docs/phases/lanes/placement-workbench-lane.md "The skill"). Add a pointer row in
  kit-level-design-and-layout-generation.md §1.3 to it rather than a new research file; this report's
  sources belong in that §1.3 as a short "house assembly" sub-block if the planner wants them in docs.

## Vault evidence (manifest directory listing, skyrim-source/manifest-skyrim-meshes.txt)
- meshes/architecture/farmhouse/: farmhouse01..06 (whole houses), a matching farmhouse0Nwalkway per house,
  farmhousedoor01/ldoor01 separate, farmlonghouse01, inn01, smith01, farmwell01, fencewoven01/02, ivy01-03,
  fern01/02, destroyed variants (farmhouse05destroyed01/02). The co-location suggests a unit of house + walkway + door + ivy + fence + well,
  not wall pieces. This is inferred from filenames; confirm the pairing from plugin data
  (kit-assemblies-mined.json / Skyrim.esm placements) before relying on it.
- meshes/architecture/whiterun/wrbuildings/: wrhousewind01..04, wrhouse02, stores01/02 each a whole mesh with
  its own _lod; wrlodwindowglow01 (by its name, a separate LOD window-glow mesh); wrjorvaskr01backporch01 a separate porch.
- The only true vanilla exterior wall/roof kit is meshes/architecture/shackkit/ (58 pieces): framing
  (L/M/R end/mid, turn corners), walls incl. wallwindow01/02, walltopwindow01, walldoor01, roof side/mid/corner,
  and 20+ "broke" wear variants. Riften/Windhelm/Solitude are whole buildings plus city-specific
  walls/decks/stairs/doors (e.g. rtplayerhousedeck01, rtsnowshoddeck01/02, whdockdoortrim).
- Hearthfire (BYOH, the only Bethesda house-building kit) is not in the vault (no dlc/byoh meshes directory).

## (1) The step-by-step to make one house read well
Sources agree on this order (Haplo/TR exterior guide; CK Bethesda Tutorial Clutter; Beyond Skyrim AU Level
design; Level Design Book env-art "start big, save smaller details for later"; UESP Skyrim:Construction shows
Bethesda's own staging: Foundation -> Walls -> Roof Framing -> Roof, then exterior add-ons):
1. Purpose first: "give every room a purpose or story ... filling in what the room should have"
   (CK Bethesda_Tutorial_Clutter ProTip). Decide who lives here and what they do before choosing pieces.
2. Shell and foundation: seat the shell; TR's Hlaalu shells carry their own foundation "to allow for more
   versatile use in more precarious places" and are lowered until the door frame meets the ground
   (TR Exterior Modding Guide). Grid snap is for architecture only; "Gridsnap in exteriors looks unrealistic"
   for anything else.
3. Walls with openings on the right faces: pieces snap exactly; "Eyeballing kit pieces will always leave gaps
   and seams" (CK Bethesda_Tutorial_Layout_Part_1/2). Walls need thickness where cut for doors/windows;
   corners need their own inside/outside pieces (Ian London, modular kit geometry). CGA shape grammar
   (Mueller et al. 2006) encodes the same rules: windows and doors must not intersect other walls, doors open
   onto terraces or the street.
4. Roof and roof trim: roof pieces overlap slightly; joins covered by beams/trim (Steam CK Public thread);
   Fallout 4 kits add explicit roof trim pieces (Burgess GDC 2016 slides "Roof Trim").
5. Door: doors are separate references fitted into the frame; "Rinse, lather, and repeat for all your
   buildings" (TR guide). Bethesda pairs a walkway/porch mesh to each farmhouse (vault evidence above).
6. Joins hidden: freeform assembly uses pillars/posts to hide seams; moving groups creates "spiderwebs",
   fixed by snap-to-reference (CK Layout Part 2).
7. Lights: lamps "properly sunken into the ground, placed on a surface, or hung from some sort of a pole or
   rope"; a lightpost at house entrances and front porches (TR guide; Project Tamriel Exterior Guidelines).
8. Clutter in two kinds: "town clutter" (common, in alleys) and "personal clutter" (a crate or urn outside
   a doorway, right next to a house) (TR guide). Scale clutter only 0.5-1.5 (CK Clutter WarningBox);
   havok-settle loose items for natural angles (CK Clutter ProTip).
9. Ground blend: vertex shading "around the bases of large rocks, trees, and buildings" and "around the
   edges of every building" (PT Exterior Guidelines; TR guide). In our stack this is the skirt/foundation ring
   of building-placement-rendering-treatments.md.
10. Balance: "an empty floor" and "a full room" both look awkward (Beyond Skyrim AU Level design); avoid
   "nervous cluttering" (PT Exterior Guidelines). Wear by dressing: ivy on neglected buildings, cleared on
   used ones (Level Design Book env-art, The Last of Us Part 2 example).

## (2) Common mistakes and the guides' remedies
| Mistake | Guide wording / source | Remedy |
|---|---|---|
| Floating, bleeding, back faces ("caspering") | PT Exterior Guidelines, TR Guidelines for Exterior Showcases | check every contact; F-drop / settle |
| Gaps and seams between pieces | CK Layout Part 1/2 "spiderwebs" | grid or snap-to-reference; cover with pillars/trim |
| Duplicate left in place (z-fighting) | CK Clutter WarningBox | detect coincident duplicates |
| Door frame above ground, no steps | TR guide (Hlaalu foundation) | lower shell to the door sill or add steps |
| Identical repeated pieces | CK Clutter "Find & Replace: Swapping Repetitive Pieces" | swap to 01/02/damaged variants |
| Mixed cultures in one settlement | PT "No Set Mixing": "Vanilla doesn't do that" | one kit family per settlement |
| Nervous cluttering / clutter without story | PT Exterior Guidelines; CK Clutter ProTip | purpose first, then fill what it implies |
| Scaling pieces far out of range | CK Clutter "only scale between 0.5 and 1.5" | clamp |
| Lights floating | TR guide | sit, sink or hang every light |
| Patch pieces to fix a bad kit | Burgess (80.lv) | fix the core piece or source one |

## (3) What a workbench agent needs (building-assembly skill)
Order: purpose card -> shell (seat, door sill at grade) -> openings audit (which face is front, doors to
path, windows not into neighbours/terrain) -> roof + trim (overlap, no gaps) -> door + steps/porch -> joins
covered -> lights (sat/hung) -> personal clutter ring at the door -> town clutter between houses -> wear/ivy ->
ground blend -> variety pass across the settlement -> render front/back/iso and describe.
Checks per building: every piece's contact measured (float < tolerance, penetration only where designed);
no coincident duplicates; door sill to ground height <= one step, else steps; each door faces a path; every
window face clear by >= 1 m; lights have a support below or a mount above; clutter scale 0.5-1.5; a minimum
dressing set (door + light + >= N personal clutter + roof detail) present; not identical to any other house
in the settlement (signature compare).
Workbench gaps found in tooling/placement-workbench/wb.py argparse (lines 331-414): place/move take yaw
and uniform scale only (no pitch/roll, no mirror), no group/prefab ("pack-in") command, no variant-swap
command, no "which face is the front / where are the openings" check beyond `doors`, no repetition check.

## (4) Variety practice
- Swap repeated pieces for 01/02/damaged variants (CK Clutter Find & Replace; Burgess 2013 "texture
  variations ... are cheap").
- Players notice repeated detail faster than repeated architecture: keep the shell, vary the dressing
  (Burgess 2013, via kit-level-design §1.3).
- Rotate and scale clutter (0.5-1.5) and cluster it fractally: "place one rock, then duplicate, shrink,
  rotate, and slightly offset" (Level Design Book env-art; TR guide "Stagger things, don't space them evenly").
- Higher-granularity kits multiply combinations ("Old Way = 20 Objects, New Way = 123 Objects"; "Mix/Match,
  lots of small pieces, multiplicative effect") and large "gross" decals and greebles obscure kit patterns
  (Burgess GDC 2016 slides).
- Hearthfire's fixed shell gets variety from add-ons: 3 wings x 3 options = 27 combinations, six of nine with
  a patio or balcony (UESP Skyrim:Construction).
- Pack-ins: prefab groups of clutter/lights, made in an empty and a filled version, then edited per use
  (Fallout 4 CK PackIn; Nexus Pack-In Collection).
- Procedural: floor overrides, hand-placed hero overrides, volume overrides for door panels at entrances
  (SideFX Building Generator); WFC/model synthesis with hand-authored adjacency (mxgmn/WaveFunctionCollapse;
  Stalberg talks) suits grid kits, not whole-house meshes.

## Sources
- https://web.archive.org/web/2025/https://wiki.project-tamriel.com/wiki/Exterior_Guidelines (live site 403/Cloudflare)
- https://web.archive.org/web/2023/https://www.tamriel-rebuilt.org/content/tutorial-exterior-modding-guide
- https://web.archive.org/web/2023/https://www.tamriel-rebuilt.org/content/guidelines-exterior-showcases
- https://web.archive.org/web/2024/https://www.tamriel-rebuilt.org/forum/exteriors-feedback
- https://ck.uesp.net/wiki/Bethesda_Tutorial_Clutter ; https://ck.uesp.net/wiki/Bethesda_Tutorial_Layout_Part_1 ; https://ck.uesp.net/wiki/Bethesda_Tutorial_Layout_Part_2
- https://wiki.beyondskyrim.org/wiki/Arcane_University:Level_design
- UESP Skyrim:Construction (en.uesp.net API) ; UESP General:Skyrim Cities' Design Excerpts
- http://blog.joelburgess.com/2013/04/skyrims-modular-level-design-gdc-2013.html
- https://archive.org/stream/GDC2016Burgess/GDC2016-Burgess_djvu.txt ; https://gdcvault.com/play/1023202/-Fallout-4-s-Modular
- https://80.lv/articles/building-huge-open-worlds-modularity-kits-art-fatigue
- https://book.leveldesignbook.com/process/blockout/metrics/modular ; https://book.leveldesignbook.com/process/env-art
- https://ianlondon.github.io/posts/modular-level-kit-geometry/
- https://www.sidefx.com/tutorials/building-generator/
- https://dl.acm.org/doi/10.1145/1141911.1141931 (Mueller, Wonka et al., Procedural Modeling of Buildings, 2006)
- https://github.com/mxgmn/WaveFunctionCollapse
- https://falloutck.uesp.net/wiki/PackIn ; https://www.nexusmods.com/fallout4/mods/39443
- https://steamcommunity.com/groups/SkyrimCKPublic/discussions/1/648814844520183311
- https://www.nexusmods.com/skyrim/mods/58262 (Building kits and other items, 383 farmhouse meshes, 64-unit snap)

## Recommendations
1. Stop treating a "house" as one shell piece: author a house as a dressing set (shell + door + porch/steps +
   light + personal clutter + roof/wall detail), mirroring Bethesda's farmhouseNN + walkwayNN + door + ivy
   (vault farmhouse/ listing). The fixed set becomes the skill's minimum-dressing check.
2. Put the checklist in section (3) into the placement-workbench skill (lane round 2), not a new doc.
3. Add to wb.py: pitch/roll and mirror on place/move, a `group`/prefab command (pack-in), a `swap`
   variant command, a front-face/openings check, and a per-settlement repetition signature.
4. Source a Bethesda-style farmhouse kit with baked windows/shutters or the Nexus "Building kits and other
   items" pack (skyrim/mods/58262, 383 farmhouse meshes) as a candidate; check its licence (credit link,
   no path moves) and tropicalisation fit before relying on it. The vanilla shackkit is the only in-vault
   exterior wall kit with window pieces.
5. Hold one kit family per settlement (PT "No Set Mixing"); variety comes from variants, add-ons and dressing.
