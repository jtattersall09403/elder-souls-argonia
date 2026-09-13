# 16i — The five exemplars, end to end

**Goal.** Take Lilmoth, Nine-Trunks, Mazzatun, the licensed tapping camp and
Wamasu Pond all the way: exterior as composites from the mined templates,
the door transition and interior load contract, **tier A interiors**
(furnished cells a mod plugin already links to the shell, copied verbatim)
and a typed reserved state on every other door (decision 0062: assembled
interiors are Phase 12's), the approach and reveal, doors that open onto
ways, navigation reported honestly (the bake is 10b's), dressing that
varies, ground patched where a pad needs it. The owner walks
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
2. **Interiors, tier A, and the load contract** (per ruling 13 and decision
   0062; nothing of it exists yet): a typed **portal + foundation record**
   on every enterable shell; the **door transition** and an **interior load
   contract** in `packages/` (how an interior cell is fetched and entered
   through a door, through the bundle contract of world 80 §63, so a house
   door and a later dungeon door are one mechanism); **interior lighting**
   for a cell with no sun (local lights, fog colour, ambient: the first time
   the renderer does this, so budget a round on it). **Tier A**: for each
   exemplar shell that a plugin links to a furnished cell
   (`exterior-interior-links.json`, 571 shells, never guessed), re-read the
   cell's references with their transforms through `esp_index` and export
   them as an interior bundle, furniture and clutter included; a base object
   with no kit asset is listed as a gap, never faked; acceptance is
   "reference count in the cell equals placements in the bundle minus the
   listed gaps". Where the shell has no linked cell, apply relaxed
   preference 1 (Phase 12 section of the phases README): a furnished vanilla
   cell of the right size class and use, retextured, is acceptable behind an
   Argonian shell; record the choice on the door's `interiorClaim`. **Every
   remaining door** carries `interiorStatus: reserved`; it stays closed and
   shows a text-catalogue message (text-reviewed) when used. Mark the **D0
   safe interior** each settlement owes (quests 20 §12) on its record. Add
   the per-cell `acousticProfile` / `lightingProfile` fields to the interior
   record now (values are 12b's and Phase 12's). Interior navmesh bakes wait
   for 10b and the record says so.
2b. **The two settlement grammars are proven here, not re-invented**: the
   Imperial-fringe recipe on Lilmoth, the Hist-centred recipe on
   Nine-Trunks and Mazzatun (`type-recipes.json` plus the mined assembly
   templates). A recipe that needed a hand decision is a gap in the recipe
   and is closed in the recipe.
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
8. **Type register**: record which place type each exemplar is
   (`world/sources/catalogue/type-recipes.json`), because 16j's trial packet
   picks types from this list and the automation checklist (96 §3) counts
   exemplars per type.

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
