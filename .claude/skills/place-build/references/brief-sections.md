# Design brief sections in detail (place-build step 1)

Moved out of SKILL.md to keep it lean (0105 R39). Step 1 names each section;
this file holds what each must say. Rulings cited as R<n> are one line each in
[rulings.md](rulings.md).

Every lane brief, the design brief's run line included, carries a hard
wall-clock stop, `Budget: <N> min (hard)` (R60, 0106), and every check-in
reports each lane's elapsed time against it (R62).

- § Interiors (0103 decisions 1–2; `references/doors-interiors-sockets.md`
  §2): one row per door: building, shell, tier (A with its chosen cell,
  or `reserved` with the pool named, or `none` only for an open-fronted
  piece with no door, walked into, R18, or a `hollow` shell no plugin
  gives a load door, 0114), and why. The plugin data is the manifest
  (0114, R83): a building the player must enter takes a shell whose own
  plugin links it to a cell. **`reserved` is legal only for a tier B or C
  interior** (0105 R2: a dungeon, a unique large interior). A dwelling,
  shop, stable house or workplace door is never reserved: re-shell to a
  shell with a linked furnished cell, or, for a doorless hut, dress the
  inside as exterior placements (no door record; the hut is walked
  into). Standard houses, stables and workplaces are never Phase 12's. **Asset-aware, always** (owner 2026-09-27; CLAUDE.md
  golden rule): a shell whose doorway was designed to load into an
  interior is used only with the interior its author designed for it
  (vanilla or mod, in the vault or sourced from Nexus in this slice);
  the cell and every piece in it must come from assets we hold or can
  get: vanilla Skyrim (Tropical Skyrim's version first where one exists,
  else the vanilla mesh checked for fit in a tropical marsh) or a mod
  in the pool. **Creation Club, HearthFires, Dawnguard, Dragonborn and
  the SE resource pack are not ours and never will be**: a cell needing
  one of them does not fit, and a shell whose only interiors need them
  is swapped for a shell that has a usable one. "Nobody lives there" is
  no reason for a store, barn or workshop to lack its room: if the
  shell has a load doorway, it gets its designed interior (with its
  sockets); if it has none (an open-sided barn, a lean-to), it has no
  door record and is walked into. A shell with a load doorway and no
  interior anywhere is not used. The owner is never asked to buy an
  archive.
  The cell is the fit rule's pick, written by
  `blueprint_interiors.py --claim` in step 2; the brief states the
  expected pick so a different one is noticed. Doors are typed
  (0104 decision 4): `load` (a cell transition), `hollow` (0114: a shell no plugin
  gives a load door, no prompt) or `swing` (opens in
  place, no cell: a barn door, a gate, a room divider), and a swing door
  is a `door` record too, so the runtime animates it and its collider.
- § Containers and items (owner 2026-09-27). Containers are **placed as
  meshes now** (barrel, chest, sack, crate, urn, basket, strongbox from
  the kits), each with its `container` socket and fill rule; Phase 13
  fills them. Visible dressing items that carry an `item` socket (a tool
  on a bench, a bottle on a table, a fish on a rack, a book on a shelf)
  are placed as meshes now from the kits, because they are part of how
  the place looks. Loot in the inventory sense (weapons, potions, coin,
  a named quest object) is an `item` socket with its class and value
  band, and Phase 13 places the mesh when the item catalogue defines
  it; a quest object whose class has no asset anywhere is a step-0
  record correction, never a promise left open.
- § Creative register. How many containers, items, yard pieces and idle
  spots a place gets, and where, is the builder's call above the
  promises (the promises are the floor, never the ceiling), sized to the
  place's occupants and trade. So that fresh agents do not make the same
  "creative" calls every time, read the rows of
  `references/creative-register.md` for this type and region (one row
  per built place: its signature dressing ideas, container mix, idle
  spots, lights, the small stories told by clutter) and make at least
  three calls this place within 0098's rules that are not the same
  signature as any of those rows; `close_place.py` appends this place's
  row at the slice close.
- § Sockets (0103 decisions 5–6; `references/doors-interiors-sockets.md`
  §5): one row per authored socket: kind, host (the placement it sits on
  or in, or the cell), data (roster slot and schedule, activity, item
  class and value band, container class and fill rule or loot table,
  danger band and zone), why. Every roster slot gets a work and a home
  socket; every promised service an `npc` socket at its parcel. Sockets
  that yard sets and interior cells yield automatically are not rows.

- § Quests (restored 16j item 2; quests 90 §65b). The place's local
  quests, to brief level only (premise, cast, choice, size, the
  provisions each needs), drafted from `docs/quests/25-quest-place-map.md`
  and the record's `questHooks`; each provision is a promise row (0104)
  and gets its socket or door; a brief that needs a placement the world
  cannot give is negotiated here (a substitute, or the 0104 decision 6
  record correction). The D0 safe interior the settlement owes (quests
  20 §12) is a promise filled by a door's `fills`; its cell's
  `acousticProfile` and `lightingProfile` slots stay typed and empty.
  Prose goes through one `text-review` per batch, over the batch's
  briefs and record corrections.
- § Seams (step 0.3b): on-road or off-road, the route ids and terminals
  every internal way joins, the berths and the landing that reaches
  each from dry ground, the sign arms and what they point to.
