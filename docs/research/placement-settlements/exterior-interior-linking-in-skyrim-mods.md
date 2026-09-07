# Exterior-interior linking in Skyrim plugins (data level)

Research for placement-settlements work: how a .esp/.esm ties an exterior
door on a building shell to its matching interior cell. Sourced from the
UESP Skyrim Mod File Format pages (`en.uesp.net`, MediaWiki API,
`action=parse&page=Skyrim_Mod:Mod_File_Format/<RECORD>`) and the DOOR record
page. `ck.uesp.net` / `www.creationkit.com` returned 403/redirect-to-XWiki at
research time (2026-09-07); the UESP Mod File Format pages are the current
source for this data and are consistent with community CK documentation.

## REFR and the XTEL subrecord

A placed door is a `REFR` record whose base object (`NAME` field) points to
a `DOOR` record. The teleport link lives on the REFR, not the DOOR base:

- `XTEL` (32-byte struct) on a door REFR: `formid` of the **destination DOOR
  REFR** (not the DOOR base record, a specific placed reference), then
  `float[3]` destination x/y/z position, `float[3]` destination rotation
  (radians), `uint32` flags (`0x01` = No Alarm).
- Position/rotation in XTEL are absolute world/cell coordinates for the
  arrival point, not relative to the destination door's own placement; a
  test-derived clarification on the UESP Mod File Format talk page (`x=0,
  y=0, z=0` lands at the cell/world origin, not at the door).
- The CK enforces the link as bidirectional: setting a teleport target on
  door A auto-sets door B's XTEL back to A, and creates a yellow 'teleport
  marker' at each door showing the exact arrival transform. The marker is
  visual/placement UI in the CK, not a separate record.
- `XRTM` (related, for random/reusable door pairs): lets a destination door
  specify a separate marker REFR so a randomly-linked door can copy that
  marker's position/rotation as the arrival point, instead of a fixed offset
  in front of the paired door.

Source: `Skyrim_Mod:Mod_File_Format/REFR`.

## DOOR record

`DOOR` is the base object referenced by door REFRs: geometry/behaviour, not
placement. Relevant fields: `MODL` (mesh path), `FNAM` flags (`0x02`
Automatic Door, `0x04` Hidden, `0x08` Minimal Use, `0x10` Sliding Door,
`0x20` Do Not Open in Combat Search), `SNAM`/`ANAM`/`BNAM` (open/close/loop
sound), `TNAM` (list of formIDs for a random-teleport door: on first use a
random destination is picked from this list and then baked into the save).

Not every door is a teleport (load) door: a door can swing/slide open in
place (interior-interior within the same cell, e.g. a room door) with no
`XTEL` at all. Activation just plays the open animation. A teleport/'load'
door is identified by the presence of `XTEL` on its REFR.

Source: `Skyrim_Mod:Mod_File_Format/DOOR`.

## CELL record and how the interior is identified

`CELL` is used for both interior (top group `CELL`) and exterior (`WRLD`
sub-group) cells; same record layout, `DATA` flag bit `0x0001` marks
Interior. A CELL record is followed by a `GRUP` (group) holding that cell's
placed references, split into persistent and temporary children sub-groups.

To resolve 'which interior does this door go to', take the destination
formID from the door REFR's `XTEL`, find that REFR record, and walk up to
its parent `CELL`: the CELL whose REFR-group contains that destination
REFR is the interior. There is no separate exterior->interior CELL-to-CELL
field; the link is always mediated by a specific door REFR inside the
target cell.

Interior cells for placed-building work are identified by `EDID` (editor
ID), not FormID, when mining across plugins by hand: conventionally
`<ModOrPlacePrefix><Building><NN>` with an `Int`/`Interior` suffix (e.g.
`WhiterunBanneredMare01` in vanilla, or `<modprefix>...Int`). This is
convention only, not a parser rule; the only structural link is the REFR
graph (XTEL -> REFR -> parent CELL), and EDID naming should never be relied
on programmatically; read the XTEL target instead.

Source: `Skyrim_Mod:Mod_File_Format/CELL`.

## What interior a building is designed for, in data terms

For a placed exterior shell (a `STAT`/architecture kit piece) with a door
REFR against it, its matching interior is exactly the CELL reached by
following that door REFR's `XTEL` target. There is no other record tying
shell geometry to an interior cell: the mod author's placement of the door
REFR *is* the design decision.

Two things worth knowing before treating an interior cell as reusable
across shells:

- **Template reuse.** Modders (and vanilla) commonly reuse one interior
  cell across many exterior shells that all look the same from outside
  (identical building kit piece), either by pointing multiple exterior door
  REFRs at doors inside the same interior CELL, or by duplicating the CELL
  and its REFR group per building instance. Both patterns exist in
  vanilla Skyrim; which one a given mod used has to be checked per-cell (do
  multiple exterior doors' XTEL targets land in the same CELL formID, or in
  distinct copies).
- **The interior cell's REFR list is its full piece inventory.** Every
  `STAT`, `FURN`, `CONT`, `LIGH`, `DOOR` (and other) REFR listed under that
  CELL's GRUP is the complete placed content of that interior: this is the
  set to read when trying to determine what pieces the interior's author
  intended to go together, for kit-compatibility purposes (per the
  golden rule that kits only combine pieces designed to combine).

## Practical mining notes

- To find whether an exterior shell has a working interior in this
  plugin, enumerate DOOR-base REFRs placed in the exterior CELL/WRLD, check
  each for an `XTEL` subrecord, resolve the target REFR's formID, and look
  up that REFR's parent CELL.
- A door REFR with no `XTEL` is not a load door (in-place open/close only,
  or non-functional/decorative if flagged Hidden).
- `TNAM` random-teleport doors have no fixed single destination in the
  record: the interior can only be determined by enumerating the
  destination list, since the actual link is chosen at runtime and baked
  per save.
- Interior CELL formIDs are plugin-local (low 24 bits) and get master-file
  offset when loaded as a master by another plugin; always resolve
  formIDs against the specific plugin's master list, not as raw hex.
