# Interior additions (decision 0109)

One `<cellId>.json` per tier A cell that needs kit pieces its plugin does not
place, most often a flame fixture (a candle, candle-horn or lantern) so that
the room is lit by its own sources:

```json
{"schemaVersion": 1, "cellId": "KeebaHouseFisher",
 "additions": [{"id": "KeebaHouseFisher:add:table-candle", "assetId": "<published kit asset>",
                "pos": [x, y, z], "rotZDeg": 0, "zone": "table",
                "why": "One short line: the resident's reason."}]}
```

- `pos` is in metres in the cell's own frame, the frame its placements use
  (x east, y up, z south); `rotZDeg` is the compass yaw.
- `zone` is one of bed, table, hearth, work, door, store, shrine.
- An addition only adds a published kit piece. It never moves or removes a
  plugin reference; a missing plugin piece goes in `../substitutions/`.

Read by `tooling/world-generation/worldgen/export_interior_bundle.py`
(`load_additions`), which refuses an asset in no published kit, a duplicate
id and a position outside the cell. Re-export after an edit, from
`tooling/world-generation/`:
`python3 -m worldgen.export_interior_bundle --plugin "King of the Murkmire.esp" --cell <cellId>`.
The lighting rule then gives each lit fixture its kit light. The design rule
is in `.claude/skills/place-build/references/doors-interiors-sockets.md` § 7.
