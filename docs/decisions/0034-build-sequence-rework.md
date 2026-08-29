# 0034 — Build sequence reworked: risk-first order, exemplar-first folded in, freeze-gates, scope corrections

**Date:** 2026-08-29 · **Status:** accepted (owner review of the remaining
phase order; all four headline choices put to the owner and approved)

## Context

The owner reviewed the post-8c phase order and challenged several things:
Phase 9 as "next" despite being low-risk; casual deliverable assertions
("docking, storage and passengers") being read as gospel; Phase 10's
undersold asset pools; the stale "authored as absolute numbers" phrasing
(superseded by 0019's fourth amendment); Phase 15's outdated framing; and
the fact that decision 0029's exemplar-first pattern had never been folded
into module 95 (0029's own notes admit this).

## Decisions (owner, 2026-08-29)

1. **Risk-first order** — after 8c: 10 (asset deep catalogue + kits +
   vegetation machinery) → 11 & 12 as exemplar-first *system* phases
   (interleavable) → 9 (traversal) → 10b (parity + navmesh) → 10c (stats
   implementation) → 13 (fauna ecology/encounters/loot) → 14 (streaming) →
   15 (rollout by region packet); 12b (soundscape) moves fully into the
   Phase P polish tier. Rationale: vegetation-at-scale and
   settlement/dungeon placement quality are the unretired *dealbreaker*
   risks; traversal is well-understood sourcing (and boats may slip or, at
   worst, be dropped).
2. **Freeze-gates, not start-gates**: 10b and 10c gate a region packet's
   *freeze* (combat-space probes; compiled numbers), not the *start* of 11/12
   authoring — safe because content is authored semantically against the
   workstream-S schema (0019 fourth amendment, module 76 §128) and compiled
   to absolutes later. The 00-core acceptance rule ("combat spaces …
   validated") is satisfied at freeze.
3. **Phase 9 scope**: player's own craft only. **Ferry services and boat
   fast travel are Morrowind-style** — talk to the ferryman, pay, arrive:
   instant travel over a defined, geographically sensible service graph; NPC
   passengers are set dressing. Delivered as world content with settlements
   (Phase 11). Player-boat cargo storage, passenger carrying,
   repair/ownership and boat combat hooks are deferred until a quest brief
   or playtest demands them (nothing currently does — checked across the
   quest plan). Module 60 §45's component list is now tiered accordingly.
4. **Sound fully polish-tier**: 12b runs in the P window *after* Phase 13 and
   authors creature calls/settlement ambience *from* the ecology data
   (reversing the earlier 12b-before-13 direction — you can't place frog
   sounds until you know where the frogs are). Hard edge: before Phase 14
   locks voice/memory budgets.
5. **Phase splitting is allowed** when risk ordering favours it. First
   application: ecology is split — the **flora half** (species palettes,
   densities, regional variation) runs with Phase 10's vegetation system;
   the **fauna/content half** (habitats, populations, encounters, loot,
   disease) stays at Phase 13 behind 10b/10c.
6. **Phase 10 asset mandate widened** ("no shortcuts"): the catalogue spans
   the whole permitted pool — BM&V, Tropical Skyrim, the Xanmeer kit, and
   vanilla + candidate tables — creatures included, thousands of assets in
   scope, with a "catalogue wide, kit-compile deep on demand" working rule.
   (Module 90 already said most of this; module 95's deliverables were the
   stale part.)
7. **Mine the shipped worlds for rules** (module 95 §86.0b, new): generalise
   the proven pattern (WTHR-as-checklist, BM&V LTEX mining) — extend the
   plugin readers to placement/grass/region records and mine vanilla + BM&V +
   Tropical Skyrim for micro/macro placement and ecology statistics that
   become compiler defaults. Rules, never lifted places (00-core rule 6).
8. **Phase 15 recast as "rollout by region packet"** — the province-wide
   fields already exist; what expands region-by-region is content, via the
   proven placement systems. The phase opens by drafting the packet roadmap
   for owner sign-off. Exemplar-first (0029) is now §85.4 of module 95, and
   each placement phase proposes its 2–3-instance contrast set at start.
9. **Performance can't wait for Phase 14** (owner): 14 *locks* budgets, it
   doesn't introduce streaming/LOD. Every placement phase ships through the
   existing tiered streaming/LOD architecture as content lands (chunk
   streaming since Phase 6; module 65 tiers + budget probes; module 80 §63
   bundles); **the province must stay loadable and playable in the owner's
   browser at every phase gate**, and Phase 14 items (draw-distance rings,
   impostors, caps, compression) are pulled forward into rollout packets if
   scale strains that.

## Also fixed in the same change

- Stale "authored as an absolute number" phrasing (pre-fourth-amendment) in
  module 95 and PROGRESS replaced with the semantic-authoring model. Module
  76 carries the same stale phrasing in §102 and §128's opening line — left
  for workstream S to fix (its file, currently active).
- **Gap found**: the semantic authoring schema (76 §128) covers *actors*
  only — **loot and traps have no semantic schema yet**. Added as an explicit
  10c deliverable; worth raising in the owner's S round-2 reply so the
  schema lands with the design.
- PROGRESS.md's header pointed at the deleted plan's redirect stub.
- A separate router/docs audit (same session) fixes discoverability issues;
  those are hygiene, not decisions, and are listed in the commit.
