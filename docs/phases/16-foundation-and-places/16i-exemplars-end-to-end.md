# 16i — The five exemplars, end to end

**Goal.** Take Lilmoth, Nine-Trunks, Mazzatun, the licensed tapping camp and
Wamasu Pond all the way: exterior as composites from the mined templates,
interiors for the buildings that earn them (Phase 12's exemplar slice), the
approach and reveal, doors that open onto ways, navigation that works,
dressing that varies, ground patched where a pad needs it. The owner walks
each; every steer becomes a rule; the settlement-build skill is rewritten
to v2 from what was actually needed.

Needs ruling 13 (interior scope).

## Read

- `.claude/skills/settlement-build/SKILL.md` (v1 — the path you will
  replace); `world/96`, `world/97` in full; `world/70` §47–50 and
  `research/placement-settlements/mined-interior-assembly-and-settlement-form.md`,
  `exterior-interior-linking-in-skyrim-mods.md` (the interior behind
  each shell's door, read from plugin data); `research/placement-settlements/openworld-approach-and-wayfinding.md`
  §5; `research/rendering/building-placement-rendering-treatments.md` §3;
  the five blueprints and design records in `world/sources/blueprints/`;
  `docs/quests/20-world-provisions.md` for each place's provisions.

## Deliver

1. **Exteriors as assemblies**: every building in the four built exemplars
   is a composite from `kit-assemblies-mined.json` or a single piece the
   source authors use alone; the kit QA skill run on every assembly; the
   `assetPlan` corrected where the catalogue named a kit that cannot serve.
2. **Interiors** (per ruling 13): the interior cell the plugin links for
   each enterable shell, compiled through the Phase 12 grammar path as its
   first exemplars (portal + foundation data, the interior kit, the door
   transition), on the exemplars' own buildings; navmesh bakes wait for 10b
   and the record says so.
3. **Approach, reveal, wayfinding**: the 16-item checklist answered on the
   ground for every approach; first-seen landmark, gate across the road,
   door visible from the way.
4. **Ways, canals, docks, boats**: placed as 16h made possible; a hull at
   every berth of its class; the tapping camp's creek and landing as
   authored.
5. **Ground**: pads as patches only where the design record asks; no
   re-carve of anything else.
6. **Owner walk**, one place at a time, with the steers written to the
   0041 taste ledger as general rules and to 97 as checks.
7. **Skill v2**: rewrite `.claude/skills/settlement-build/` from the steps
   that were actually needed for the fifth place, including the kit QA and
   interior steps; delete what v1 says that is no longer true.

## Acceptance

- Five places compile at 0 errors and 0 unexplained warnings; the bundle
  exports with no known-red rows owned by this chunk; the browser probe
  reports non-zero geometry and zero grounding findings; the owner has
  walked all five.

## Owner check (per place; say what is wrong in one line)

- Lilmoth `?view=character&x=3.61&z=6.38&t=12:00`: approach from the road,
  through the gate, along the spine to the market; enter two buildings.
- Nine-Trunks `x=4.97&z=3.76`: the ring, the decks, the dock; a canoe there?
- Mazzatun `x=1.99&z=1.34`: the terraces, the stair, an interior.
- Licensed camp `x=3.44&z=4.48`: the stage, the creek landing, the board.
- Wamasu Pond `x=2.47&z=4.40`: the hazard reads from the approach.
- Frame rate low / medium / high at Lilmoth.

## Gotchas

- Cities and opening-scene places stay owner-guided (plan §7); Lilmoth is
  the city here — expect two rounds, not one.
- Every prose edit through `text-review` separately.
