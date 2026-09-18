# 0072 — The ring's tiers are tile bands the shader fades; the studio serves files from disk; the water's colour rides alpha

**Date:** 2026-09-18 · **Phase:** 16f round 3 · **Status:** accepted

The owner's third walk of 16f (feedback of 2026-09-18) found every tree,
rock and sea-bed piece gone, plants still in rows, ground cover fading the
wrong way, a console warning from the water, a bare sea bed and an uneven
frame rate. The evidence and the numbers are in the
[16f ledger §16](../research/phase16/16f-ledger.md); this records the calls.

1. **The dev server serves `public/` from the disk, never from a start-up
   list.** Vite caches the public file set when it starts and relies on
   watcher events to keep it current. The kit builders and the chain rewrite
   `public/kits/*.kit.json` and the province rasters while the shared-port
   server keeps running across sessions; a rewrite the watcher missed made
   the flora kit manifest "unknown", Vite fell through to the SPA fallback
   and answered with `index.html`; the scatter layer swallowed the JSON
   error. A middleware in `vite.config.ts` (`es-fresh-public-files`)
   streams any existing public file as it is on disk, ahead of Vite's own
   middleware; the index-load rejection in `Vegetation.tsx` is logged,
   never swallowed. The rule this enshrines: **a layer that fails to load
   its data says so on the console; a silent catch is a defect.**
2. **Ground-cover tier membership is decided per TILE with an overlap
   margin; the shader does all the fading.** A plant is copied into
   every tier's buffer whose outer radius (plus the margin: the rebuild
   distance plus the widest fade half-width) its tile can reach, so both
   copies of a crossing plant exist at the moment of the crossfade and the
   dither measures the live camera distance in both directions. The old
   per-instance assignment at rebuild time fixed one tier per plant, so a
   card copy faded OUT as the camera approached its band's inner edge with
   no mesh copy behind it; everything reappeared at the next rebuild.
   Rebuilds now run every 8 m of movement or a tile crossing; tiles are
   generated in `useFrame` within a per-frame budget (5 ms, 14 ms while the
   ring is cold), nearest first; a tile's matrices and colours are composed
   once at generation and a rebuild is a block copy per mesh; the bounding
   sphere comes from the tile extents. The budget counts plants, not
   copies. The design lives in `Groundcover.tsx`'s header (mechanisms 2
   and 7) and is app-private renderer debt until 10b like the rest of it.
3. **Both ring hashes end in MurmurHash3's finaliser**, in TypeScript
   (`packages/game-core/src/vegetation/ringHash.ts`) and in the Python twin,
   because the last mixing step folded the salt in with one multiply and
   one shift and consecutive salts (the x jitter, the z jitter, keep) were
   strongly correlated: every candidate stood on one of two diagonals in its
   cell and the ring read as rows. The Python twin now draws the runtime's
   own streams (it drew `np.random` before), so `test_no_species_stands_in_rows`
   measures the ring the browser draws; it is red on the old hash.
4. **The water's colour constituents ride the alpha of two rasters the
   shader already binds** (algae in `uSurfShore.a`, dark in `uKlassTex.a`,
   written at load into the DataTexture bytes; the PNGs stay RGB and no
   canvas premultiply touches them). The water material was at the 16-sampler
   limit and 16f's `uColourTex` made it 17: "Trying to use 16 texture units
   while this GPU supports only 16" on the owner's machine. The rule: **no
   new sampler on the water material; a new per-texel field goes in a spare
   channel.**
5. **Under water the scene target ping-pongs.** Submerged, the water's
   underside was drawn into the scene target while refracting through it
   (`uSceneColor`) and soft-depthing against it: a framebuffer feedback loop,
   undefined on every GPU and an error per draw under ANGLE. The underside
   now reads the previous frame's target; the second target is made on
   the camera's first submersion.
6. **Screen-space reflections stop at 420 m** (fade from 260 m; they ran
   to 1.2 km) — at that distance the environment map's sky reflection is
   the same pixel. 16c built the rest of the water's distance ladder
   (a dense grid close to the camera with an exponential fringe; detail
   normals, ripples, rain rings and the horizon blend all distance-faded); nothing here touches the
   frozen water data.
7. **Sea-bed densities are authored for a swimmer's sight line** (10–20 m):
   a layer must put several pieces inside a 15 m radius to read at all. The
   medium pieces (the scatter's `SEABED_BAND`) rose from 4–25/ha to 12–120/ha
   at the shoreline on the same ramp; the ring's three bed covers tripled.
   The corals are Jokerine's two 3D meshes at 2.5–9× (the only true corals
   any Skyrim mod ships; the Depths card fans went in round 2).
8. **The baked scatter's meshes are pooled** (the ring's mechanism 7 ported
   to `Vegetation.tsx`): a rebuild writes into persistent instanced meshes,
   uploads only the filled prefix; the bounding sphere comes from the
   bucket's extents instead of a read-back of every matrix. A new solids list
   forces a collider rebuild, so things are solid at a spawn before the
   first step.
9. **The 56 ha `ocean` over-reach is accepted for good** (owner: no refreeze
   will ever run); the backlog row records what it costs.
