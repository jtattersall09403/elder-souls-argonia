# Lessons: Tooling gaps still open

Part of the lessons store; the row format and the file index are in [README.md](README.md).

| Id | Rule | Defect and cause | Enforced by | Shot | Source | Types |
|---|---|---|---|---|---|---|
| L42 | Give the reader lit, framed shots; a black or unreadable image is re-rendered, never read | one reader view of a dark close-up came back black (workbench round 4) | prose only: 16k 1b multi-shot render | all | reader round | all |
| L43 | Author the whole layout in one file; a round gathers every `check` failure and reader NO into ONE layout edit, one `apply`, one plan render and at most one Blender launch; four rounds is the ceiling; a finding that returns after its fix goes to the planner; a round never touches a kit build or the frozen world | yard B took 90 mutating calls and 32 renders for 18 placements (0100 evidence); Claywater fixed items one at a time (0102 decision 4) | `wb.py apply`, `render --shots auto` (16k 1b); SKILL step 4 | - | workbench round 4; 0102 | all |
| L44 | Expect HTBM's boardwalk joint to penetrate 0.081 m (its own 15-degree joint) and the compile to slide a quay pose 0.025 m; neither is a layout defect | workbench round 4 Open row | open: no gate | - | workbench round 4 | all |
| new | Bind every member of a yard set laid by `group place --parcel` with its own `bind` op (kind assembly, layer clutter or light) | `assembly.load_group` gives each member the role `{on: ground}` with no kind, so `--parcel` never binds it; the compile dropped every member and every socket hosted on one (32 errors) | compile socket host check; tooling row in the Tag House requests | - | compile refusal, the Tag House walk 9 | all |
