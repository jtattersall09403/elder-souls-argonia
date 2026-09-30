# How the builder works (owner 2026-09-27, after the walk-2 round took five rounds)

Moved out of SKILL.md to keep it lean (0105 R39); the skill links here from
its opening. Read once per slice; the rules are binding.

- **Recommend and do.** A rule, gate, tool or record fix the builder
  finds it needs, and that sits under an existing decision (0097–0104,
  0081), is filed to the tooling sub-lane (below) with its fail-first
  test and its lessons row, never written inside a round; it is
  reported, never asked. The
  builder stops for a ruling only on an owner-level call (a place moved
  or cut, a quest premise changed, a new type, a world-level rule) or
  when a check cannot be met with any asset we hold after a completed
  search.
- **Fan out inside the lane.** Kit rebuilds, bundle exports, pose and
  yard scans, plugin mines and every render read run as parallel
  sub-agents (`run` for jobs, `find` for look-ups, a Sonnet reader per
  image) while the builder edits; nothing that can run beside the edit
  runs after it. Interior kits are the exception: every interior kit a
  batch needs is built in one pre-pass before its builders start, and a
  builder never builds one.
- **Scan before editing.** Step 2 starts with `wb.py scan` (the site
  feasibility scan: for every building's candidate poses, pad legality
  with batter, road-paint overlap, water depth along a landing bearing,
  the pieces' designed sinks and porch or stair reach), so a pose that
  cannot pass is never authored. A defect the scan could have shown is a
  scan gap, fixed first. The `scanFreshRule` check enforces it (0105 R31):
  a building op (a `place` with a `pad`) new or changed since HEAD fails
  unless a scan output written after HEAD's commit of the layout holds its
  asset and pose. A planner's brief names the need ("a stable the paddock
  can reach"), never the site; the scan finds the site.
- **One round, one batch, one apply.** Every finding of a round is one
  layout edit and one `wb round` (apply + check + walktable + shots);
  `check --only <uids>` judges the named pieces' rows, pairs and
  per-piece rules; the graph rules (`walkRule`, `pathReachRule`,
  `berthReachRule`) rerun in `wb round`.
- **A fresh agent per round.** A round ends with the WIP layout, the
  check list and the brief on disk (`wb round --report-dir
  tooling/.reports/16k/<place>/round-N/`: `summary.json`, `rounds.jsonl`,
  the scan output, the fix list and `waiting-on.json`, the tooling tasks
  the round waits on; `references/round-recipe.md`); the next round
  starts a fresh agent from that folder, never a context that has grown
  past one round.
- **Tool work never rides in a place round** (method review 2026-09-27
  finding 6: four hour-long rounds went on writing rules). A rule, gate
  or tool gap found in a round is filed as a tooling task and built by a
  `deliver` sub-agent in parallel; the place round continues on the
  rules that exist and takes the new rule at its next round. During
  the Phase 15 rollout builders never edit tools at all: one tooling
  lane owns every gap. The round ceiling (four) counts apply rounds too.
- **The builder writes the brief** from slice 2 on (0100 decision 8 as
  amended 2026-09-27: the planner writes the brief only for owner-guided
  types 8 and 9); the planner reads the brief with the packet.
- **Reads are digests, never every brief.** Step 0 reads a generated
  site packet (`site_packet.py`: the record, promises, dossier facts,
  route seams, neighbours within 2 km for the 0098 rules and within
  500 m for the seams, the type sheet, the lessons rows for this type)
  and the register digest (one line per built
  place, generated from the briefs), never every `design.md` or every
  register row. Anything the builder must know is in the packet or is a
  packet gap.
- **A proven type is cheap.** Once a type has passed two walks
  (`type-recipes.json` `proven: true`), a place of that type takes the
  fast path: site packet → the type's layout template
  (`layout_template.py`, 16k S10: emits the layout from the packet and
  the type sheet's yard sets; hand edits only where the packet's seams
  demand) → one `wb round --no-shots` to zero check failures → gates by
  `place_gates` (one command, about a minute: the 0102 rules, the
  promise and socket gates, the interior bundle gate, the 0098 bars) →
  publish. The chain runs as a `Workflow` of `run` agents; the Opus
  builder is woken only for the brief's deltas and for failures the
  chain leaves. No plan read, no render round (the type sheet may ask
  for a sampled one in N places), no per-place preflight, review,
  text-review or deploy: those run once per batch of places (per walk
  packet in 16k, per region packet in Phase 15), which is the owner's
  standing ruling for the deploy (16k step 3) applied to the batch.
- **Six at once.** Builders run as parallel lanes on disjoint places;
  the box takes about six (the Workflow cap binds before CPU). What
  serialises them is a defect: a whole-file writer without a lock, a
  shared output folder, a pool sized to the machine instead of its
  job-guard slot, a watchdog that freezes an admitted job, a review
  stamp written without a lock (16k S9). Each place publishes its own
  bundle file (`settlements/<place-id>.json` plus `settlements/index.json`;
  the runtime reads the index and the bundles within range, 16k S8) so
  publishes never contend, and commits its own files with
  `commit_place.py --place <id>` (16k S12), which stages the place's
  per-place files only, from its manifest, so lanes never race on git.
- **Builders write only per-place files** (method review r3, 2026-09-27).
  A per-place file is one of the table above, the place's promise
  ledger, its bundle and its `tooling/.reports/16k/<place>/` folder. A
  change to a shared file (a zone catalogue `places-<zone>.json`,
  `world/sources/quests/*`, `yard-sets/<type>.json`, a kit's
  `*.interiors.json`, `references/lessons/`, `reader-checklist.md`,
  the type sheet, the registers, `type-recipes.json`,
  `accepted-places.json`) is a REQUEST row appended to
  `tooling/.reports/16k/<place>/requests.jsonl` (file, the change, the
  reason, the place); one integrator lane applies a batch's requests
  under a lock, once per batch. A builder that edits a shared file
  directly has broken the batch's commits.
- **Text-review reads the delta.** A brief built from a type's template
  is reviewed only on its delta lines (the lines the generated brief
  marks as changed from the type sheet); the template's own rows were
  reviewed once in the type sheet.
- **Same-type places walk together.** Once a type's first place is
  accepted, its next two places (the two "in a row" of 16k § Slices 2
  on) are built together, in different regions, and go to the owner in
  ONE walk packet (16k § Owner check-ins).
- **Hanging pieces and missing commands.** A hanging piece (a flower
  strand, a hanging lantern) is hung with `mount --hang`
  (placement-workbench § 4; hangingRule fails it on the ground). A
  placement or measurement no command makes is answered in headless
  Blender with `wb.py bpy` (§ 5b) and the command is added in the same
  round, never parked as "needs a tool" (owner 2026-09-28).
- **Readers for a Workflow lane.** A deliver lane inside a Workflow has
  no Agent tool: it runs `wb.py round` itself and names the render folder
  in its report; the PLANNER then runs the Sonnet readers as one Workflow
  over that folder (one reader per image) and the `text-review` agent. A
  lane never reports "no readers ran" as a gap.
