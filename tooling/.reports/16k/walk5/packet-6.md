# Walk packet 6 — Claywater walk 6, Greenspring walk 4, Riverwalk walk 1, performance, fire, WebGPU

Everything from your walk-5 notes is delivered. Studio base: `https://jtattersall09403.github.io/elder-souls-argonia/studio/` (add `?view=character&x=..&z=..&t=..`; `t=12` noon, `t=22` night; `&interior=<cell>` opens a house from its door; `&sockets=1` shows sockets). The WebGPU build is the same studio at `/webgpu/` instead of `/studio/`.

## Your questions from the last packet, answered

- **Why didn't agents see these defects?** Nothing an agent could look at drew fire or light: the Blender renders had no fire pass, and studio walks are barred. Now: the place renders draw every resolved flame (day and night), every lit piece gets a day and night close-up, the interior gets a render from its door and two corners (`wb.py render-interior`), a fast standalone contact sheet renders each fire preset in seconds, two separate checkers judge every sheet, and a measured check fails the build if a flame sits outside the thing that should hold it. The skill now says: read every height and position back from the PUBLISHED bundle before you claim it.
- **Two flames on a candle lantern:** correct. The Skyrim model has two candles, 7 cm apart.
- **The well:** it existed but stood in 1.08 m of water in the tarn. Moved to a dry bench; a new check fails any placed thing that is submerged.
- **Work sockets:** the spot inside a building where a person does their job (the forge, the counter, the net bench), never a separate idle spot.
- **Swing doors, the three cells:** shells from mod packs neither place uses yet; nothing of ours swings. No change.
- **Navigation box:** genuinely fixed; it no longer shows.
- **Pictures 404:** they were in a folder git ignores, so never uploaded, and the tool posted anyway. It now copies pictures to a tracked folder and refuses to post until they are pushed.
- **Lights cap 16:** it existed because the old renderer rebuilt its shaders each time the light count changed. Now 100, with each object lit by its 8 nearest lamps and no rebuilds.
- **Ferry landing "lowered":** the claim was never true (an 8 cm move). The real cause was a rendering bug drawing every water-side dock 1.3 m above its measured height. Fixed in the renderer; the check now measures against the water the studio draws.
- **Stable floor flicker:** the pad and the floor sat exactly level. A 3 cm clearance rule, measured.
- **Paths not painted:** the paint layer silently dropped every place's paint whenever one place's terrain hadn't arrived. Fixed; a test covers it.
- **Interior load 5–11 s:** shaders were compiled on the first visible frame. They now compile during the black hold. Timer lines are logged per entry.
- **Interior sockets:** were authored on the outer shell, never inside. Now inside every interior (38–79 per cell), promises fulfilled indoors where fitting.
- **Dark interiors:** the rooms had lamps but the loader used a flat ambient; the wall candle-holders in the overseers' houses also faced the wall. Now: Skyrim's own directional ambient per room, lamps designed per zone (door, table, hearth, bed), 37 holders turned round, every room at least 70% lit by its own sources (79–100%).
- **Time spent last round:** 5 h 48 min, of which the final checks were 82 min (the review ran three times; 12 test reds found only at the end; 17 full place rebuilds for small edits). Fixed: review once per batch, lanes run their own tests before returning, incremental republish, readers inside each lane.

## Walk 1: Claywater Station (walk 6), noon then night

- Ferry landing: `?view=character&x=0.332&z=3.005&t=12`. The deck should sit just above the water you see, about a metre lower than before.
- Stable floor: `x=0.328&z=3.040&t=12`. No flicker between grey and grass.
- The well: `x=0.323&z=3.062&t=12`, on the dry bench.
- Campfires and braziers by day: flames visible with the smoke. At night (`t=22`): living flames, not glowing blobs; lantern flames inside the lanterns.
- Imperial house: enter, `&sockets=1`: sockets inside the room.
- Interiors (add `&interior=` to `x=0.304&z=3.042&t=22`): `DawnstarBrinasHouse`, `KeebaHouseFisher`, `KeebaHouseCrafter`, `KeebaHouseSnailMinder`. Each should read warm and lit by its own candles, lanterns and hearth. Loading under 1.5 s.

## Walk 2: Greenspring (walk 4)

- Village at night: `x=4.747&z=1.859&t=22`. The HUD fps line: this is the 23 fps reading you sent. Read it again, and by day.
- The lanterns by the Hist tree: flames inside the lanterns.
- Paths: textured, not just cleared.
- Interiors (`&interior=`): `KeebaHouseElder` (x=4.764&z=1.865), `LilmothGlassworksOverseerHouse` (x=4.720&z=1.881), `LilmothIronworksOverseerHouse` (x=4.734&z=1.838), `LilmothPlantationStorehouse` (x=4.774&z=1.825). Hearth flames visible; wall candles facing the room.

## Walk 3: Riverwalk (walk 1) — the new place

A ferry-stop hamlet on the north river, in the Dark Elf settler region (Dunmer North). Its people are Argonians (lizard folk, the marsh's natives): the region's lore is "layered occupation, never blended", so an Argonian hamlet under a Dark Elf name is the documented pattern. One long house standing in the cove on stilts (a Skyrim mod's swamp house, found in the vault), a stage shelter, boardwalks over the cove, a shrine, a moored ferry raft, a canoe.

- Entrance: `x=7.186&z=0.573&t=12`.
- The long house on the water: `x=7.232&z=0.520&t=12`; its door `x=7.223&z=0.518`; the plank's dry end `x=7.220&z=0.517`. Deck level, stilts to the bed, plank onto dry ground. At night the door lantern should light the doorway.
- The raft with two lantern flames: `x=7.236&z=0.601`. Canoe: `x=7.245&z=0.635`.
- Shrine: `x=7.211&z=0.520`. Stage shelter: `x=7.232&z=0.630`.
- Enter the long house (`&interior=KeebaHouseCrafter`): lit, with sockets.

## Walk 4: performance and vegetation (same studio)

- Startup: no darker flash on trees or buildings; ground cover fills nearest first within a few seconds, no waves; the HUD's gc line should show 0 rebuilds/s after the first seconds.
- Jungle: `x=4.02&z=4.61&t=12`. Walk toward a stand of trees: detail steps up as you approach and down as you leave, with a short blend, nothing popping in then out. Bushes hold full detail to ~50 m.
- Big trees far off: solid 3D (the giant to 390 m), mangroves and willows as impostors beyond that, reading correctly from every angle. Leaves: fuller crowns than before (the transparency cutoff now comes from each model). Tell us if any species' crown looks like a blob.
- Send the HUD fps and gpu lines from Greenspring night, the jungle and Claywater.

## Walk 5: WebGPU (A/B)

- New build: `https://jtattersall09403.github.io/elder-souls-argonia/webgpu/?view=character&x=4.747&z=1.859&t=12`. The top HUD line names the backend ("webgpu").
- Same address with `&renderer=webgl` added: the new build on the old graphics system.
- Old build: the `/studio/` address with the same coordinates.
- Compare fps and the gpu line at Greenspring (day and night), the jungle and Claywater; on the Honor phone too (Chrome; if it lacks WebGPU the build falls back and the HUD says "webgl2").
- Look for: any missing effect (fog, wind in plants, tier fades, water ripples and falls, sky, moons, lamp pools, fire), black or white patches, and how long the first view takes.
- The volume fire (campfires, hearths, braziers, torches within 35 m, WebGPU only): the one on-device judgement in this packet. It has a hot core and reads by day, but its tongues merge softer than the card flames. Say whether it looks better or worse than the card flames in `/studio/`.

## Also for you

- One paste: the description line of `.claude/agents/deliver.md` still says water work needs your sign-off; the body is updated. Replace it with: "Never for diagnosis, design or decisions. Water work is allowed like any other planned work (owner 2026-09-29)."
- The two crashes: both were one job (the interior light pass) growing to 30 GB inside the session's process group. Fixed at source (21 GB to 1.4 GB), and every heavy job now runs in its own memory-capped scope so a runaway dies alone. No swap file needed.

## How to feed back

Reply on issue #1 as before: one line per point, with the address you were at.
