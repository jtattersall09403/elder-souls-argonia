# Reader checklist (what the Sonnet image reader is told)

Generated from the rows of `lessons/` that carry a shot, plus the Gate
rows of the 16k checklist (`docs/phases/16-foundation-and-places/16k-place-loop.md`
§ The checklist). When a lessons row with a shot is added or edited,
edit its line here in the same change. The id after each line is its
source.

**Tags (method review r3, 2026-09-27).** Every row ends with a tag:
`reader` (a look no tool measures) or `rule:<name>` (the `wb.py check`
rule, or the `compile.<gate>` of `compile_settlement`, that measures
it). **Readers get only the `reader` rows**; a `rule:` row is never
pasted into a reader's prompt, because a red there is already a check
failure. A row with a measured half and a looked-at half stays
`reader`. When a new rule starts measuring a `reader` row, retag it in
the same change. Tally: 23 `reader`, 19 `rule:` (the round-1 review
estimated ~24 measurable; rows 4, 6, 11, 17, 19 and 28 are partly
measured and stay `reader` until a rule covers the whole row).

## The prompt preamble (paste it first)

You are reading renders of one place built from game kit pieces. Answer
every line below (the `reader` rows only are pasted) for every shot it names with YES, NO or UNSURE (every
line is a question whose right answer is YES), and for
each NO give the shot file, its subject (the round manifest's `subject`
for that shot), the compass position of what you mean in that shot
("the NE corner of the stable", "the second hut west of the gate") and
what you see, in metres where the 1 m grid allows. The renders carry no
piece labels (0105 R8): never guess an id. UNSURE means "re-render this closer or lit";
never guess. A black, blank or badly framed image is reported as
UNREADABLE with its file name, not read (L42). Do not suggest fixes.
The designer's expectations for this round are listed after the
checklist; say where a shot contradicts one.

**The builder maps a NO to a piece** by re-rendering that one shot with
`--labels` (`wb.py SCENE render --shots <that shot's token: top,
iso:BEARING or front:UID> --labels`, one Blender launch) and reading the
id at the named position; readers never get labelled images.

## Plan (the `render_blueprint` PNG; step 3)

1. Does every building's door tick face a way, with the way passing within about 4 m of it? (L07) `rule:pathReachRule`
2. Are no three or more buildings standing on one bearing at one spacing, and are no two lanes parallel at one width? (L08) `reader`
3. Are buildings at least 8 m apart centre to centre, with props not counted as buildings? (L09) `rule:compile.spacing (97 C5)`
4. Does every way end at a building, dock or gate it names, with no way running through a footprint and no two ways doing the same job? (L11) `reader`
5. Is every part of the place that stands in plain view of a node within 150 m joined to it by a path? (L14) `rule:walkRule`
6. Does the gate stand across its road, with no way entering past it? (L12) `reader`

## Top (the Blender top view; step 4)

7. Does a path or worn ground reach every door? (L15; Gate "Paths and worn ground to every door") `rule:pathReachRule`
8. Is each doorway turned to its path rather than to a wall, the water or the scrub? (L07) `rule:pathReachRule`
9. Do the huts avoid ruled rows and exact rings? (L08) `reader`
10. Is the Hist tree (if any) standing clear, with nothing built over it? (L17) `reader`
11. Does the gate stand across the road it is named for? (L12) `reader`

## Front (one per building; step 4)

12. Does the base sit on the red ground line, neither floating nor sunk past its designed sill? Give the gap in metres. (L24, L25; Gate "Seated, joined") `rule:sillRule, floorEdgeRule`
13. Does the door leaf stand square in its frame, not skewed or turned? (L23) `reader`
14. Is the door, its step and any porch present, with no door part in the roof or a wall? (L22) `reader`
15. Does the building show windows, a light, a roof detail (chimney, overhang or trim) and personal clutter at the door? (L19, L20; Gates "Windows glowing at night", "Lights by time of day") `reader`
16. Is every dressing piece standing on the ground or its host, or hanging from its mount, with none floating? (L34; Gate "Yard dressing vocabulary") `rule:propSeatRule`
17. Is there no rubble ring, skirt band or code-placed clutter hugging the base or blocking the door? (L33) `reader`
18. For a stilt or quay piece: are the legs visible, the deck above the ground or water, and the stair reaching the ground? (L24, L30) `rule:floorEdgeRule, walkRule`
19. For a dug-in piece: is the threshold flush with the approach, and are the flanks closed by ground or rock with no hollow end showing? (L25, L26) `reader`
20. Do run pieces (walls, fences, docks, boardwalks) meet at their joints with no gap, overlap or step in height? (L28, L29; Gate "Seated, joined") `rule:compile.modularRuns (mined abuts pairs)`
21. Is no plant, bush or tree standing in a doorway or through a floor? (L35) `rule:compile.clearance, walkRule`
22. Is the solid mass (tower, stair block) left without a door unless it is meant to be entered? (L18) `reader`
23. Does a landing stage end over dry ground, with its closing step's foot on that ground? (L31, water-edge places only) `rule:berthReachRule`
24. Is the entrance lit at night: a window glow facing the approach, or a mounted light within 2 m of the threshold? (L19; 97 C16) `rule:compile.litEntrance (0102 decision 7)`
25. Does every unmined small mount (e.g. a lantern on a barrel) read as resting on its host, neither floating nor sunk into it? (L34; 0102 decision 5) `reader`

## Iso (two per round; step 4)

26. Does each district read as one kit set, with no piece from another culture's buildings among them? (L05) `rule:compile.cultureKit`
27. Do the building shells read as one kit or as a deliberate pair, never as an accident? (L05; 0102 decision 8) `reader`
28. Does every pair of houses differ (shell, porch, openings, dressing or turn), with no two reading as copies? (L20) `reader`
29. Is there fencing or walling where the culture builds it (Imperial yards, gate and fields) and none in an Argonian quarter unless the brief cites the lore? (L16; Gate "Enclosure") `reader`
30. Does every raised deck or level have a stair or ramp that can be seen from below? (L30) `rule:walkRule`
31. Does every run end on an end piece, a neighbour or the ground, with no open end? (L28, L30) `rule:compile.openModularEnds`
32. Is the first-seen object from the main approach taller than the trees around it? (L13; Gate "Seen from a distance") `rule:compile.firstSeen`
33. Is each boat either afloat in open water with the landing stage reaching it, or beached on the bank where the brief pulls it up? (L32, R5; Gate "Water edge", water-edge places only) `rule:beachedRule, berthReachRule`
34. Is there a cook fire, forge glow or chimney smoke where the brief names one? (Gate "Fire and smoke") `reader`
35. Are the ground and wall meeting without a hard line or a gap under the wall? (Gate "Ground-to-wall blend") `reader`
36. Are there pads, retaining walls or steps where the ground slopes under a building, with no floor hanging over a drop? (Gate "Pads, retaining walls, steps") `rule:floorEdgeRule, padRule`
37. Does each building read as the right social scale for this place (a hamlet's stable, not a castle's; a village house, not a manor), and is every outdoor light an outdoor piece, with no interior sconce or candle on an outside wall? (0105 R1) `reader`, `rule:setting.class`

## Owner walk-4 defects (front and iso; step 4)

Each is also a `check` rule since 2026-09-28; the reader is asked too
because the owner walked every one of them before a rule measured it.

38. Is any building's roof line or eave at ground height, the walls sunk out of sight? Give the depth in metres. (owner walk 4, the Claywater stable) `reader`, `rule:burialRule`
39. Does any deck or landing stand a body-height above the shore or the water, with its land end left in the air and no step down? (owner walk 4, the Claywater landing) `reader`, `rule:landingRule`
40. Is any hanging asset (a flower strand, a hanging lantern, a basket on a hook) standing on the ground instead of hanging from its tree or mount? (owner walk 4, Greenspring's Hist flowers) `reader`, `rule:hangingRule`
41. On a signpost with two or more arms: are two arms level with each other or pointing the same way? (owner walk 4, the Claywater well post) `reader`, `rule:signRule`
42. Is any lantern, candle or brazier sunk into the floor, deck or ground it stands on? (owner walk 4) `reader`, `rule:fixtureSeatRule`
43. When reporting a direction (an arrow, a facing, a raised arm), does the reader state it as screen-left or screen-right with the camera bearing, never "the same way" or "pointing at X"? The planner compares the stated side against `signRule`'s `pointsDeg` before briefing a fix. (owner walk 4: a reader misread a correct sign) `reader`

## Owner walk-5 defects (close-up, section and night shots; round-recipe 3a)

Each reader is given its shot and the designer's expected value first.

44. On a cutaway through a floor, deck or pad that meets the ground (`cutaway --focus UID --cut M`): is the floor clearly above the ground or clearly below it, never lying on the same plane over a patch (grey and grass sharing one surface flicker)? Give the gap. The measured half is a `bpy` ray ring under the floor: a gap under 0.05 m over more than 1 m² is a NO. (owner walk 5, the Claywater stable floor) `reader`
45. On the front of each piece the fix list moved: does the base stand where the expectations say (the published `positionM[1]` from the SKILL § 5 read-back, drawn against the red ground line), not where it stood last walk? (owner walk 5, the Claywater landing claimed lowered, unchanged) `reader`
46. On an iso without overlays: does every way read as worn or paved ground distinct from the grass either side, not only as a cleared strip? The workbench's orange top-view line is the layout, not the paint; every way must also have a published `groundPaint` entry (§ 5 read-back). (owner walk 5, Greenspring's paths) `reader`
47. On a night shot through each lit doorway into the interior: is the floor, the far wall and the hearth or main furnishing lit, with no room left black? (owner walk 5, the Greenspring huts) `reader`
48. On three interior renders of each tier A cell (from the door and two far corners, the runtime light model: no shadows, no bounce, the cell's ambient cube as the sky, its lights as points, no fill): does the room read warm and readable, lit by its own hearth and lanterns (light pooled round each source, falling off towards the walls), not flat, evenly grey or washed out? The measured half is `interior_light`: `sourceLedFraction` ≥ 0.70 and the dark fraction ≤ 30 % (doors-interiors-sockets § 7); a render that reads flat is a NO whatever that number says. (16k walk 5 F1 follow-up) `reader`
49. On the same interior renders: is every wall, floor and piece textured (no surface one flat colour), every piece resting on a floor, table, shelf, wall or ceiling (nothing hanging in the air), every stair meeting a floor at both ends, and every hearth burning? The measured half is `wb.py audit-interior <cell>` exit 0 (textures, support, stairs, hearth, lit density; doors-interiors-sockets § 3); a NO on the picture with a green audit is a new audit row. (owner walk 6, the Greenspring hut: flat green walls, no hearth fire) `reader`
50. Is `wb.py coplanar` (places) / `audit-interior` (cells) at 0 before the renders, and on the renders does any surface shimmer or show two textures striped over each other (a decal flush on a floor or wall, two panels on one plane)? A hit is fixed at source (R90), never by a render angle.
51. Does the built studio draw every flame the cell and the place burn? Measured only: `node tooling/visual-look/flames.mjs interior <cellId> <xKm> <zKm>` PASS for every cell the doors claim and `flames.mjs place <placeId> --t 22` PASS for the place (fire.md § 3 step 4); the PASS lines go in the walk packet. A flame proxy on a render or a look sheet never answers this row. (owner walk 7: three rounds claimed flames the studio never drew) `rule:flames.mjs`

## Owner walk-8 defects (front and iso; step 4)

52. Does every prop used from one side face its user: a chair toward its table or out from the wall to the path, a spit or oven mouth to the cook's open side, a lantern arm over the way, a shop board out from the wall readable from the street? Name any that face a wall. (R94; seats are also measured by `seatFacingRule`) `reader`
53. Does every lodging, trade, stable or smith building show its board on a bracket post beside the door, not over the opening? (R96; Gate "Signage, banners, totems, shrines") `rule:serviceSignRule`

## Walk only (never asked of the reader)

Colliders (L27), visibility at range and the flicker, flash and camera
findings (L45, L46), idle occupants, doors as transitions, and the look of
night lighting (whether a lit entrance exists is Front row 24) are judged
on the owner's walk.

- **Interiors** (L50, L51; Gate "Interiors"): each tier A door entered
  from the studio (the door itself, or `?view=character&interior=<cellId>`),
  the room read as the maker's furnished room under its own lights, and
  the way back out onto the same doorstep. The final look is the owner's
  GPU walk; whether any room is left black is asked first (row 47). That the cell is shipped and its bundle count
  matches is a gate (the exporter's acceptance, `test_export_interior_bundle.py`), not a question.
- **Sockets** (L52): the `?sockets=1` markers are shown on the walk for
  the owner's eye only; their data is gated by the compile.
