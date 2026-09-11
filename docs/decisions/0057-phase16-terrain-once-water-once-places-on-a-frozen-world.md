# 0057 — Phase 16: terrain once, water once, places on a frozen world

Date: 2026-09-11 · Status: **PROPOSED — awaiting the owner's rulings listed in
the plan** ([docs/phases/16-foundation-and-places/README.md](../phases/16-foundation-and-places/README.md)
§ Owner decisions). Supersedes the chain order recorded in 0025 and the
"the level is the flood of the real terrain" rule of 0047 and the "measure the
shipped raster" rule of 0049 **for terrain-moving consumers only**. Phase 11's
delivery plan (0041) and the 2026-09-07 gap plan are absorbed, not reopened.

## The problem

The province has been rebuilt and the water re-solved every time place work
moved, because the chain is circular: places cut terrain inside
`refine_province` (dock dredges, authored poling channels, typed terrain
requests, settlement pads), the water is re-flooded from that terrain twice
per run and every derived piece of a blueprint then drifts and is re-derived
([audit](../research/phase16/audit-chain-and-terrain.md) §1 lists ten edges).
The water level is a strict function of a terrain that four later stages move
([audit](../research/phase16/audit-hydrology-data-model.md) §2). Neither
water bodies nor rivers exist as entities with stable ids, so nothing
downstream can refer to "this river" or "this pool"; seasonality is a
per-pixel arithmetic result rather than a recorded fact.

## Decision

1. **One ordered ladder, each rung frozen before the next starts:**
   hydrology graph → base terrain (built to *enable* every water feature the
   graph names: trenches, plunge bowls, knickpoints, tarn bowls) → water
   compiled once → routes and grading → vegetation → macro plot → meso →
   micro. A rung's output is content-hashed and read-only to the rungs below.
2. **The hydrology graph is a typed, committed record with stable
   geographic ids** (rivers as end-to-end entities with reaches of kind
   horizontal / sloped / vertical, junctions, bodies with a kind, an altitude
   band and a stored season). The carve realises it, `compile_water` reads it
   and never re-floods the province, the scatter reads channel membership from
   it, routes and places read it for every water fact.
3. **Places adapt to the world, not the world to places.** A record that the
   frozen ground and water cannot carry is moved (macro or meso), re-typed,
   re-written or cut; the place-count floor is relaxed to allow this (owner,
   2026-09-11). Cities keep their owner-approved anchors.
4. **The only post-freeze terrain edits are typed local patches** (raise-pad,
   flatten-to-plane, cut-channel, lower-bowl) with a bbox, a blend and a hard
   delta cap, applied from the frozen array in id order, re-flooded locally at
   the frozen level and **failing** (never clamping) if a water level, a body
   extent or a channel cell would move. Only touched tiles re-export.
5. **A gate must be shown failing on a real defect before it is trusted**,
   and every chunk of Phase 16 ends with the tests and probes that would have
   caught what the owner saw. Visual ingestion by agents is allowed only under
   the budget the owner approves in chunk 16a.
6. **The five exemplars go end to end** (exterior, interior, approach, gates,
   navigation, dressing) and leave behind a runnable skill; rollout is running
   that skill per packet, with the owner hands-on only for cities and the
   opening-scene places.

## Consequences

- 0047's model stays for *appearance* (the shipped rasters are still the
  physical water); what changes is *who decides the level and when*.
- The polish backlog loses every terrain, water, vegetation, chain, route
  and settlement row that Phase 16 absorbs; they are listed in the plan's
  coverage matrix, not parked.
- Phase 11 and the gap plan close as history; Phase 12's exemplar interiors
  are pulled into 16i; Phase P keeps only what is genuinely cosmetic.
- The rulings that the owner must give before 16b can start are in the plan;
  16a needs none of them.
