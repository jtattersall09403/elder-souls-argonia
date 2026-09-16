# Water colour in Black Marsh: what the sources say (16f dossier)

Written 2026-09-16 before any body is tinted (16f deliverable 15). Sources
are the vault UESP extract (`uesp_morrowind_blackmarsh_extract.jsonl.xz`);
page names as UESP titles them. The era policy is decision 0002.

## Canon

- **Dark, moving water at the Cyrodiil border.** *Lore:A Dance in Fire*
  (Waughin Jarth): the census bridge at the border stretches "across the
  burbling dark water to the reeds on the other side". A wide, flowing
  river is read as dark, with reed margins, so dark water is not confined
  to still water.
- **Murky swamp water around ruins.** The Murkmire tale of the expedition
  to the Saxhleel ruins (*Lore:Loremaster's Archive: Murkmire Q&A* and the
  Murkmire book set): the ruins loom "from the murky water of the swamp".
- **Brackish water where swamp meets sea.** *Online:Ritual of Change*
  (Murkmire): the "Brackish Mud" is "taken from brackish water, representing
  the duality of sea and swamp"; the swamp-jelly text prefers "brackish
  water" to fresh or salt. The lagoon and delta margins are brackish, not black.
- **Named for its water.** The *Blackwater War* (1E 2811–2837, *Lore:The
  Blackwater War*) is the Imperial name for the annexation campaign; the
  province's own name is Black Marsh. Neither text describes a water body
  as black; the names carry the impression of dark marsh water without
  specifying it.
- **No source describes a lake or pool as black.** The dossiers
  (`world/sources/lore/`) carry no colour description of standing water.

## The rule we apply (real-world blackwater, kept inside what the sources allow)

Blackwater is water stained by tannins and humic acids leached from leaf
litter and peat where flow is slow and the canopy is closed; it is
tea-dark and clear, not turbid. Green water is algae in still, shallow,
sunlit, nutrient-rich water. The rule follows from those two facts.

- **Dark (tannin) grades up** in `backswamp`, `swamp` and `marsh-deep`
  bodies and `horizontal-backwater` reaches in proportion to the canopy
  fraction over their rim; the border river reads dark by its own tannin
  channel already (the compile's `blackwater` water class).
- **Green (algae) grades up** in `pond`, `pool`, `backswamp`, `swamp`,
  `marsh-deep` and `horizontal-backwater` water that is perennial and open
  to the sky. It grades down under canopy. It is absent from moving
  reaches, the sea and the lagoons, which the sources give as brackish.
- **No body is made black.** The tint is a constituent rather than a flat
  colour. It grades over tens of metres with the water's own shape.
- **Lagoons and the delta stay brackish-clear** (the salinity channel), so
  the "sea meets swamp" duality of the Murkmire ritual reads on the map.

Consumers: `worldgen/compile_water_dressing.py` writes the constituent
raster; the water material reads it beside turbidity and tannin
(16f deliverable 15).
