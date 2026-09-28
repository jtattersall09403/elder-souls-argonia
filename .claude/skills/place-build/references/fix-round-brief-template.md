# Fix-round brief template (the planner's, 0105 R31 and R34)

A planner's brief for a place's fix round (or any lane that sites or
sources a piece) follows this shape. Method review r5: briefs that named a
site cost ~45 min of trial applies (finding B), and briefs that carried
candidates from a filename survey carried false links (finding F).

1. **Run:** place id, walk number N (`build_ledger.py stage ... --walk N`,
   R32), budget, report path.
2. **Owner items, by cause:** each cause in one line, with the owner's
   words quoted.
3. **Needs, never sites** (R31): what a building must do ("a stable the
   paddock path reaches, open front away from the road"), never where it
   stands or at what yaw. The builder's `wb.py scan` finds the site;
   `scanFreshRule` fails a re-sited building with no fresh scan.
4. **Sourcing candidates** (R34): each names its record row: the manifest
   row's `settingClass` (setting and class, `n`), the sink row
   (`kit-designed-sink.json`: evidence, `fallback`), and the mounts or
   links pair it relies on (`kit-assemblies-mined.json`,
   `exterior-interior-links.json`). A candidate with no row is marked
   UNVERIFIED and the builder checks it before placing it. A find survey
   by filename is a lead, never a fact.
5. **Rulings:** only new ones, each one line, added to
   [rulings.md](rulings.md) in the same change; the builder reads the
   table, never earlier lane reports.
6. **Checks:** `place_gates` all green; the packet's § What changed is
   `wb.py whatchanged` output (R35).
