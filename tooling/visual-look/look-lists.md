# Look lists (visual-look judge questions)

The judge brief `look.mjs` prints is built from this file: every `all` row,
then the rows of the subject's class. One row is one concrete question with
a pass bar a reader can answer from the sheet. **When a judge (or the owner)
finds a defect no row asked about, fix it at source and add the row here in
the same change** ([the visual-look skill](../../.claude/skills/visual-look/SKILL.md)).

Classes: `fire-fixture`, `hanging-fixture`, `doorway`, `walkway`,
`ground-contact`, `interior-surface`, `furniture-contact`, `ground-paint`,
`building-seam` (the `seam` mode). `look.mjs`
picks the class from the kit manifest row (`--class` overrides).

| class | id | question | pass bar |
| --- | --- | --- | --- |
| all | tex-missing | Is any surface flat magenta, flat green, pure white or pure black where a texture should be? | No such surface in any tile. |
| all | no-material | Does the facts line's `noMaterialMeshes` name any mesh (a primitive with no source material: black here, a blank white card in the studio)? | Empty list; else a kit fix (drop the shape in build_kit), never a place nudge. |
| all | decal-patch | Does any hard-edged pale or white patch sit on a body surface (cracks, grime, moss overlays) where the texture should blend? | No hard-edged pale patch; overlays blend or are absent. |
| all | dark-body | Does the main body read as its material (stone, clay, wood) with visible texture variation, or as a flat near-black mass? | Texture variation visible in the front and eye tiles; if dark, report the body as DARK SOURCE for the texture-mean check. |
| all | zfight | Do two coplanar surfaces show stripes, speckle or saw-tooth mixing (z-fighting)? | No striped or speckled overlap in any tile. |
| all | bounds | Does the mesh fill its bounds box (green wire) without a part outside it or a large empty end? | Mesh touches the box on every side; nothing pokes out. |
| all | scale | Against the grid (spacing in the caption), is the piece a believable real size? | Door ~2 m, candle < 0.3 m, campfire ring ~1-1.5 m, tent taller than 1.7 m eye tile's horizon if walk-in. |
| all | night-glow | If there is a night tile and the piece has a window pane or lamp shell, what colour is the lit pane or shell? | Reads amber or warm orange with its texture visible; never flat white or near-white. |
| fire-fixture | flame-height | How tall is each flame against the grid, and against its fuel (logs, wick, bowl)? | Campfire/brazier flame rises clearly above the logs/bowl rim (at least the fuel's own height, about 0.4-0.9 m for a campfire); a candle flame is 2-5 cm and stands on the wick; a torch flame is at least as tall as the torch head; a caged lantern with no modelled candle shows a flame about a third of the cage height, readable from the full view (a speck fails). A flame hidden inside or level with its logs fails. |
| fire-fixture | flame-seat | Does each flame stand on its fuel: on the wick, in the bowl, on the log pile, not beside it or in the air? | Flame base touches the fuel in the front and side tiles. |
| fire-fixture | flame-count | Does every visible wick, torch head or fire bed carry a flame, and no flame burn where there is no fuel? | One flame per fuel point; none floating free. |
| fire-fixture | night-read | In the night tile, is the flame the brightest thing and clearly flame-shaped (tapering tongue, not a disc or square)? | Bright tapering tongue; no hard square card edge. |
| hanging-fixture | hang-body | Is the flame inside the lantern body (bottom of the piece), not up the cord? | Flame centre within the lower half of the bounds. |
| hanging-fixture | hang-clear | Would the piece, hung at its pivot (top), hang clear of a 2 m door opening height? | Bottom of the bounds is at least 2.0 m below the pivot only if it is meant to hang over a path; state the drop in metres. |
| doorway | door-open | Is the doorway opening clear (no fixture, lantern or post inside the opening)? | Opening empty in front and 3/4 tiles. |
| doorway | door-sill | Does the door's bottom meet the sill/floor line with no gap or overlap? | Gap < 5 cm in the front tile. |
| walkway | run-joins | Where planks/segments meet (joins and corners), is there a gap, step or overlap? | No visible gap > 5 cm, no step > 10 cm, no plank crossing another. |
| walkway | run-corner | At a corner, is there a continuous deck a 0.6 m wide walker could cross? | Continuous deck across the corner in the top tile. |
| walkway | run-ends | Does each open end sit on ground or meet another piece (no end hanging in air)? | Ends touch the grid plane or a support. |
| ground-contact | front-edge | In the low grazing tile, does the front edge (and every corner) meet the ground plane, or hover/stand buried? | Every edge touches the plane: no daylight gap under any edge, nothing buried deeper than 0.1 m except intended stakes/posts. |
| ground-contact | underside | From the top-down and 3/4 tiles, is any part of the underside visible as a floating sheet? | No floating sheet. |
| interior-surface | surf-seams | Do wall/floor panels meet flush at their seams with no crack of background showing? | No background light through seams. |
| interior-surface | surf-backface | Is any face invisible from one side (see-through wall, missing back face)? | Walls solid from both front and back tiles. |
| furniture-contact | furn-feet | Do all feet/legs touch the ground plane, none floating or sunk? | Every foot on the plane within 2 cm. |
| furniture-contact | furn-stack | Do items resting on it (clutter, cloth) sit on its surface rather than in or above it? | Resting items touch the surface. |
| fire-fixture | flame-on-wick | Does every flame root sit on its wick, fuel or torch head, inside the fixture's bounds (not floating above the top, not on a handle or rim outside the glass or paper)? | Flame base within 1 cm of the wick or fuel top and inside the bounds box; `anchorFailures` empty in the facts line; a caged lantern with no modelled fuel: centred in the cage, clear of the bars |
| ground-paint | paint-edge | Render: `node apps/world-studio/src/settlement/paintHarness/run.mjs <placeId>` (the published paint through WorldSky's CSM + aerial chain). At eye height, is the path a soft worn-earth track that frays into the ground round it, or a hard-edged band of square cells or cobble tiles? | No straight cell edges or stair steps; the edge fades over at least 1 m; never darker than the control strip of track texture. |
| ground-paint | paint-haze | In the same run's numbers, does the paint's contrast against the bare ground fall with range as the control strip's does (it hazes like the terrain)? | Paint contrast at 150 m at most 0.25 x its 8 m contrast, and at 300 m below 1.0 luminance. |
| ground-paint | paint-road | Does any place paint lie on the province road paint (the road always wins)? | Published paint on road texels 0 m2 (the measurement in lead-rendering walk 7: `province_road_paint` against the bundle's polygons). |
| building-seam | seam-contact | `npm run look -- seam <placeId> <suffix>`: in the _live image, does the wall sit IN the ground: a soft dark contact band at its foot, worn earth round it, no hard bright line where wall meets grass? Compare with the _bare image. | The live image is visibly darker in a band at most ~1 m wide at the wall foot and shows worn earth round the base; the bare image shows the stark join. |
| building-seam | seam-spill | Does the trampled ring or the shade spill where it should not: onto water, across a way as a second track, or as a hard-edged blob? | No paint on water; the ring frays into the grass with no straight cell edge; the shade has no visible outer edge. |
